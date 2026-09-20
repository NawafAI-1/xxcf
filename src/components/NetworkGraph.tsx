'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { Source } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/types';
import { buildGraph, type GraphLink } from '@/lib/graph';

interface SimNode extends SimulationNodeDatum {
  id: string;
  title: string;
  domain: Source['domain'];
  radius: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  kind: GraphLink['kind'];
  sharedThemes?: string[];
}

type Selection = { type: 'node'; id: string } | { type: 'link'; index: number } | null;

const WIDTH = 900;
const HEIGHT = 620;

export default function NetworkGraph({ sources }: { sources: Source[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomGroupRef = useRef<SVGGElement>(null);
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());
  const linkRefs = useRef<Map<number, SVGLineElement[]>>(new Map());
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const dragState = useRef<{ id: string; moved: boolean } | null>(null);
  const panState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const [selection, setSelection] = useState<Selection>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [showAllThemes, setShowAllThemes] = useState(false);

  const { nodes, links, neighborMap } = useMemo(() => {
    const graph = buildGraph(sources);
    const nodes: SimNode[] = graph.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      domain: n.domain,
      radius: 10 + Math.min(sources.find((s) => s.id === n.id)?.resources.length ?? 0, 5) * 2,
    }));
    const links: SimLink[] = graph.links.map((l) => ({
      source: l.source,
      target: l.target,
      kind: l.kind,
      sharedThemes: l.sharedThemes,
    }));
    const neighborMap = new Map<string, Set<string>>();
    for (const l of graph.links) {
      const s = typeof l.source === 'string' ? l.source : (l.source as SimNode).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as SimNode).id;
      if (!neighborMap.has(s)) neighborMap.set(s, new Set());
      if (!neighborMap.has(t)) neighborMap.set(t, new Set());
      neighborMap.get(s)!.add(t);
      neighborMap.get(t)!.add(s);
    }
    return { nodes, links, neighborMap };
  }, [sources]);

  useEffect(() => {
    const sim = forceSimulation<SimNode>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.kind === 'lineage' ? 110 : 170))
          .strength((l) => (l.kind === 'lineage' ? 0.9 : 0.15))
      )
      .force('charge', forceManyBody().strength(-260))
      .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
      .force(
        'collide',
        forceCollide<SimNode>().radius((d) => d.radius + 14)
      )
      .on('tick', () => {
        for (const link of links) {
          const source = link.source as SimNode;
          const target = link.target as SimNode;
          const els = linkRefs.current.get(links.indexOf(link));
          if (els && source.x != null && target.x != null) {
            for (const el of els) {
              el.setAttribute('x1', String(source.x));
              el.setAttribute('y1', String(source.y ?? 0));
              el.setAttribute('x2', String(target.x));
              el.setAttribute('y2', String(target.y ?? 0));
            }
          }
        }
        for (const node of nodes) {
          const el = nodeRefs.current.get(node.id);
          if (el && node.x != null) {
            el.setAttribute('transform', `translate(${node.x}, ${node.y ?? 0})`);
          }
        }
      });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [nodes, links]);

  function toSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * WIDTH;
    const y = ((clientY - rect.top) / rect.height) * HEIGHT;
    return { x: (x - transform.x) / transform.k, y: (y - transform.y) / transform.k };
  }

  function handleNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { id, moved: false };
    const node = nodes.find((n) => n.id === id);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
    }
    simRef.current?.alphaTarget(0.3).restart();
  }

  function handleNodePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    dragState.current.moved = true;
    const node = nodes.find((n) => n.id === dragState.current!.id);
    if (!node) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    node.fx = p.x;
    node.fy = p.y;
  }

  function handleNodePointerUp(id: string) {
    const drag = dragState.current;
    const node = nodes.find((n) => n.id === id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    simRef.current?.alphaTarget(0);
    dragState.current = null;
    if (drag && !drag.moved) {
      setShowAllThemes(false);
      setSelection((current) => (current?.type === 'node' && current.id === id ? null : { type: 'node', id }));
    }
  }

  function handleLinkClick(e: React.MouseEvent, index: number) {
    e.stopPropagation();
    setShowAllThemes(false);
    setSelection((current) => (current?.type === 'link' && current.index === index ? null : { type: 'link', index }));
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (e.target !== svgRef.current && e.target !== zoomGroupRef.current) return;
    panState.current = { startX: e.clientX, startY: e.clientY, origX: transform.x, origY: transform.y };
  }

  function handleBackgroundPointerMove(e: React.PointerEvent) {
    const pan = panState.current;
    if (!pan) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    // Capture `pan` in this closure rather than re-reading panState.current
    // inside the updater — the updater can run after a pointerup has already
    // nulled the ref, which crashed with "Cannot read properties of null".
    setTransform((t) => ({ ...t, x: pan.origX + dx, y: pan.origY + dy }));
  }

  function handleBackgroundPointerUp() {
    panState.current = null;
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setTransform((t) => {
      const nextK = Math.min(3, Math.max(0.3, t.k * (e.deltaY > 0 ? 0.9 : 1.1)));
      return { ...t, k: nextK };
    });
  }

  const selectedSource = selection?.type === 'node' ? sources.find((s) => s.id === selection.id) ?? null : null;
  const selectedLink = selection?.type === 'link' ? links[selection.index] : null;
  const selectedLinkSource =
    selectedLink && sources.find((s) => s.id === (typeof selectedLink.source === 'string' ? selectedLink.source : (selectedLink.source as SimNode).id));
  const selectedLinkTarget =
    selectedLink && sources.find((s) => s.id === (typeof selectedLink.target === 'string' ? selectedLink.target : (selectedLink.target as SimNode).id));

  const activeId =
    hoveredId ?? (selection?.type === 'node' ? selection.id : null);
  const activeNeighbors = activeId ? neighborMap.get(activeId) ?? new Set<string>() : null;
  const activeLinkIndex = selection?.type === 'link' ? selection.index : null;

  const SHARED_THEMES_PREVIEW = 4;

  return (
    <div className="flex gap-4">
      <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[620px] w-full cursor-grab active:cursor-grabbing"
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={(e) => {
            handleBackgroundPointerMove(e);
            handleNodePointerMove(e);
          }}
          onPointerUp={handleBackgroundPointerUp}
          onWheel={handleWheel}
        >
          <g ref={zoomGroupRef} transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {links.map((l, i) => {
              const sourceId = typeof l.source === 'string' ? l.source : (l.source as SimNode).id;
              const targetId = typeof l.target === 'string' ? l.target : (l.target as SimNode).id;
              const dimmed = activeId != null && sourceId !== activeId && targetId !== activeId;
              const isSelected = activeLinkIndex === i;
              return (
                <g
                  key={i}
                  ref={(el) => {
                    if (el) {
                      const hit = el.querySelector('.hit') as SVGLineElement | null;
                      const vis = el.querySelector('.vis') as SVGLineElement | null;
                      if (hit && vis) linkRefs.current.set(i, [hit, vis]);
                    }
                  }}
                >
                  <line
                    className="hit"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleLinkClick(e, i)}
                  />
                  <line
                    className="vis"
                    stroke={isSelected ? '#2563eb' : l.kind === 'lineage' ? '#475569' : '#cbd5e1'}
                    strokeWidth={isSelected ? 3 : l.kind === 'lineage' ? 1.75 : 1}
                    strokeDasharray={l.kind === 'theme' ? '4 3' : undefined}
                    opacity={dimmed && !isSelected ? 0.12 : isSelected ? 1 : l.kind === 'lineage' ? 0.8 : 0.5}
                    pointerEvents="none"
                  />
                </g>
              );
            })}
            {nodes.map((n) => {
              const dimmed = activeId != null && n.id !== activeId && !activeNeighbors?.has(n.id);
              const color = DOMAIN_COLORS[n.domain[0]];
              const isSelected = selection?.type === 'node' && selection.id === n.id;
              return (
                <g
                  key={n.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(n.id, el);
                  }}
                  onPointerDown={(e) => handleNodePointerDown(e, n.id)}
                  onPointerUp={() => handleNodePointerUp(n.id)}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  opacity={dimmed ? 0.25 : 1}
                  className="cursor-pointer"
                >
                  <circle
                    r={n.radius}
                    fill={color}
                    stroke={isSelected ? '#0f172a' : 'white'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <text
                    y={n.radius + 13}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#334155"
                    className="pointer-events-none select-none"
                  >
                    {n.title.length > 22 ? `${n.title.slice(0, 22)}…` : n.title}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-5 bg-slate-600" /> lineage (derived_from)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-5 border-t border-dashed border-slate-400" /> shared theme
          </span>
          <span>Drag nodes &middot; scroll to zoom &middot; drag background to pan &middot; click a node or a line for details</span>
        </div>
      </div>

      <aside className="w-72 shrink-0">
        {selectedSource ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap gap-1">
              {selectedSource.domain.map((d) => (
                <span
                  key={d}
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: DOMAIN_COLORS[d] }}
                >
                  {d}
                </span>
              ))}
            </div>
            <h3 className="text-sm font-semibold text-slate-900">{selectedSource.title}</h3>
            <p className="mt-1 line-clamp-4 text-xs text-slate-600">{selectedSource.abstract}</p>
            <p className="mt-2 text-xs text-slate-500 capitalize">{selectedSource.quality.status.replace('-', ' ')}</p>
            <Link
              href={`/sources/${selectedSource.id}`}
              className="mt-3 inline-block text-xs font-medium text-blue-600 hover:underline"
            >
              View full detail page &rarr;
            </Link>
          </div>
        ) : selectedLink && selectedLinkSource && selectedLinkTarget ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
            <span
              className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                selectedLink.kind === 'lineage' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {selectedLink.kind === 'lineage' ? 'Lineage link' : 'Shared-theme link'}
            </span>

            <div className="mt-2 space-y-2 text-xs">
              <div>
                <span className="text-slate-500">From</span>
                <p className="font-medium text-slate-900">{selectedLinkSource.title}</p>
              </div>
              <div>
                <span className="text-slate-500">To</span>
                <p className="font-medium text-slate-900">{selectedLinkTarget.title}</p>
              </div>
            </div>

            {selectedLink.kind === 'lineage' ? (
              <p className="mt-3 text-xs text-slate-600">
                <span className="font-medium">{selectedLinkTarget.title}</span> lists{' '}
                <span className="font-medium">{selectedLinkSource.title}</span> in its{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5">provenance.derived_from</code> field, an explicit,
                recorded lineage relationship between the two datasets.
              </p>
            ) : (
              <div className="mt-3">
                <p className="text-xs text-slate-600">
                  These datasets share {selectedLink.sharedThemes?.length ?? 0} theme/keyword
                  {(selectedLink.sharedThemes?.length ?? 0) === 1 ? '' : 's'} in common:
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {(showAllThemes
                    ? selectedLink.sharedThemes
                    : selectedLink.sharedThemes?.slice(0, SHARED_THEMES_PREVIEW)
                  )?.map((t) => (
                    <li key={t} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-200">
                      {t}
                    </li>
                  ))}
                </ul>
                {(selectedLink.sharedThemes?.length ?? 0) > SHARED_THEMES_PREVIEW && (
                  <button
                    onClick={() => setShowAllThemes((v) => !v)}
                    className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                  >
                    {showAllThemes ? 'Show fewer' : `Show all ${selectedLink.sharedThemes?.length}`}
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-1 border-t border-blue-100 pt-3">
              <Link href={`/sources/${selectedLinkSource.id}`} className="text-xs font-medium text-blue-600 hover:underline">
                View &ldquo;{selectedLinkSource.title.length > 30 ? `${selectedLinkSource.title.slice(0, 30)}…` : selectedLinkSource.title}&rdquo; &rarr;
              </Link>
              <Link href={`/sources/${selectedLinkTarget.id}`} className="text-xs font-medium text-blue-600 hover:underline">
                View &ldquo;{selectedLinkTarget.title.length > 30 ? `${selectedLinkTarget.title.slice(0, 30)}…` : selectedLinkTarget.title}&rdquo; &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-500">
            Click any node for its details, or click a connecting line to see how those two datasets are linked
            (shared themes/keywords, or explicit lineage). Hover a node to highlight its connections.
          </div>
        )}
      </aside>
    </div>
  );
}
