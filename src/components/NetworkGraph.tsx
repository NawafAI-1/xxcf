'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { Domain, Source } from '@/lib/types';
import { DOMAIN_COLORS, DOMAINS } from '@/lib/types';
import { buildGraph, type GraphLink } from '@/lib/graph';

interface SimNode extends SimulationNodeDatum {
  id: string;
  title: string;
  domain: Domain[];
  primary: Domain;
  radius: number;
  ready: boolean;
  degree: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  index?: number;
  kind: GraphLink['kind'];
  weight: number;
  crossDomain: boolean;
  sharedThemes?: string[];
}

type Selection = { type: 'node'; id: string } | { type: 'link'; index: number } | null;

const WIDTH = 940;
const HEIGHT = 640;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RING = 208;
/** Keeps nodes and their labels off the edge of the frame. */
const MARGIN = 76;

/**
 * Each domain owns a slice of the canvas. Pinning the five anchors makes the
 * layout reproducible between reloads and turns the graph into five readable
 * territories instead of the undifferentiated blob a plain centre force gives.
 * The ring starts at the top and runs clockwise in DOMAINS order.
 */
const ANCHORS: Record<Domain, { x: number; y: number; angle: number }> = Object.fromEntries(
  DOMAINS.map((d, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / DOMAINS.length;
    return [d, { x: CX + Math.cos(angle) * RING, y: CY + Math.sin(angle) * RING * 0.66, angle }];
  })
) as Record<Domain, { x: number; y: number; angle: number }>;

/**
 * Where a territory's name is written: pushed out along its anchor's bearing
 * until it clears the cluster, then held inside the frame.
 */
function labelPosition(angle: number) {
  // Pushed right out to the frame, past where a clamped node can reach, and
  // carried on a plate so a stray node behind it cannot break the word.
  return {
    x: CX + Math.cos(angle) * (WIDTH / 2 - 78),
    y: CY + Math.sin(angle) * (HEIGHT / 2 - 24),
  };
}

const DOMAIN_LABELS: Record<Domain, string> = {
  environmental: 'Environmental',
  ecological: 'Ecological',
  production: 'Production',
  'nutrition-health': 'Nutrition and health',
  'socio-economic': 'Socio-economic',
};

const THRESHOLDS = [1, 2, 3] as const;
const SHARED_THEMES_PREVIEW = 5;
/** Labels are always drawn for the busiest nodes; the rest appear on demand. */
const ALWAYS_LABELLED = 4;

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
  const [minWeight, setMinWeight] = useState<number>(2);
  const [crossOnly, setCrossOnly] = useState(false);
  const [focusDomain, setFocusDomain] = useState<Domain | null>(null);

  const graph = useMemo(() => buildGraph(sources), [sources]);

  // Everything downstream of the two filters. Rebuilding the node objects on a
  // filter change would restart the simulation and throw the layout away, so
  // the nodes are built once and only the visible link set changes.
  const nodes = useMemo<SimNode[]>(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        title: n.title,
        domain: n.domain,
        primary: n.domain[0],
        radius: 7 + Math.min(n.resources, 6) * 1.6,
        ready: n.quality === 'analysis-ready',
        degree: 0,
      })),
    [graph]
  );

  const { links, neighborMap, hiddenCount } = useMemo(() => {
    const visible = graph.links.filter(
      (l) =>
        (l.kind === 'lineage' || l.weight >= minWeight) && (!crossOnly || l.crossDomain)
    );
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) n.degree = 0;

    const links: SimLink[] = visible.map((l, i) => {
      byId.get(l.source)!.degree += 1;
      byId.get(l.target)!.degree += 1;
      return {
        index: i,
        source: l.source,
        target: l.target,
        kind: l.kind,
        weight: l.weight,
        crossDomain: l.crossDomain,
        sharedThemes: l.sharedThemes,
      };
    });

    const neighborMap = new Map<string, Set<string>>();
    for (const l of visible) {
      if (!neighborMap.has(l.source)) neighborMap.set(l.source, new Set());
      if (!neighborMap.has(l.target)) neighborMap.set(l.target, new Set());
      neighborMap.get(l.source)!.add(l.target);
      neighborMap.get(l.target)!.add(l.source);
    }
    return { links, neighborMap, hiddenCount: graph.links.length - visible.length };
  }, [graph, nodes, minWeight, crossOnly]);

  /** The busiest nodes at the current threshold keep their labels on. */
  const labelledIds = useMemo(() => {
    return new Set(
      [...nodes]
        .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
        .slice(0, ALWAYS_LABELLED)
        .filter((n) => n.degree > 0)
        .map((n) => n.id)
    );
  }, [nodes, links]);

  // One simulation for the life of the component. Link and node positions are
  // written straight to the DOM on tick; React never re-renders per frame.
  useEffect(() => {
    const sim = forceSimulation<SimNode>(nodes)
      .force('charge', forceManyBody<SimNode>().strength((d) => -120 - d.radius * 9))
      .force(
        'x',
        forceX<SimNode>((d) => ANCHORS[d.primary].x).strength(0.2)
      )
      .force(
        'y',
        forceY<SimNode>((d) => ANCHORS[d.primary].y).strength(0.2)
      )
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((d) => d.radius + 13)
          .strength(0.9)
      )
      .on('tick', () => {
        const sim = simRef.current;
        if (!sim) return;
        for (const node of nodes) {
          if (node.x == null || node.y == null) continue;
          node.x = Math.max(MARGIN, Math.min(WIDTH - MARGIN, node.x));
          node.y = Math.max(MARGIN, Math.min(HEIGHT - MARGIN, node.y));
        }
        const current = sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>> | null;
        for (const link of current?.links() ?? []) {
          const source = link.source as SimNode;
          const target = link.target as SimNode;
          const els = linkRefs.current.get(link.index ?? -1);
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
          if (node.x == null || node.y == null) continue;
          const el = nodeRefs.current.get(node.id);
          if (el) el.setAttribute('transform', `translate(${node.x}, ${node.y})`);
        }
      });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [nodes]);

  // Swapping the link force in place keeps the node positions, so raising the
  // threshold settles the existing layout rather than reshuffling the page.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((l) => (l.kind === 'lineage' ? 76 : 150 - Math.min(l.weight, 6) * 11))
        .strength((l) => (l.kind === 'lineage' ? 0.8 : Math.min(0.06 * l.weight, 0.3)))
    );
    sim.alpha(0.55).restart();
    setSelection(null);
  }, [links]);

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
    setSelection(null);
    panState.current = { startX: e.clientX, startY: e.clientY, origX: transform.x, origY: transform.y };
  }

  function handleBackgroundPointerMove(e: React.PointerEvent) {
    const pan = panState.current;
    if (!pan) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    // Capture `pan` in this closure rather than re-reading panState.current
    // inside the updater: the updater can run after a pointerup has already
    // nulled the ref, which crashed with "Cannot read properties of null".
    setTransform((t) => ({ ...t, x: pan.origX + dx, y: pan.origY + dy }));
  }

  function handleBackgroundPointerUp() {
    panState.current = null;
  }

  function handleWheel(e: React.WheelEvent) {
    setTransform((t) => ({ ...t, k: Math.min(3, Math.max(0.4, t.k * (e.deltaY > 0 ? 0.9 : 1.1))) }));
  }

  const selectedSource = selection?.type === 'node' ? sources.find((s) => s.id === selection.id) ?? null : null;
  const selectedLink = selection?.type === 'link' ? links.find((l) => l.index === selection.index) ?? null : null;
  const linkEndId = (end: SimLink['source']) => (typeof end === 'string' ? end : (end as SimNode).id);
  const selectedLinkSource = selectedLink ? sources.find((s) => s.id === linkEndId(selectedLink.source)) : null;
  const selectedLinkTarget = selectedLink ? sources.find((s) => s.id === linkEndId(selectedLink.target)) : null;

  const activeId = hoveredId ?? (selection?.type === 'node' ? selection.id : null);
  const activeNeighbors = activeId ? neighborMap.get(activeId) ?? new Set<string>() : null;
  const activeLinkIndex = selection?.type === 'link' ? selection.index : null;

  const selectedNeighbors =
    selectedSource && neighborMap.has(selectedSource.id)
      ? [...neighborMap.get(selectedSource.id)!]
          .map((id) => ({
            source: sources.find((s) => s.id === id)!,
            weight:
              links.find(
                (l) =>
                  (linkEndId(l.source) === selectedSource.id && linkEndId(l.target) === id) ||
                  (linkEndId(l.target) === selectedSource.id && linkEndId(l.source) === id)
              )?.weight ?? 0,
          }))
          .sort((a, b) => b.weight - a.weight)
      : [];

  function nodeDimmed(n: SimNode): boolean {
    if (focusDomain && !n.domain.includes(focusDomain)) return true;
    if (activeId == null) return false;
    return n.id !== activeId && !activeNeighbors?.has(n.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Show links sharing at least</span>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-200">
            {THRESHOLDS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMinWeight(t)}
                className={`px-2.5 py-1 text-xs font-semibold tabular-nums transition ${
                  minWeight === t ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500">{minWeight === 1 ? 'term' : 'terms'}</span>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={crossOnly}
            onChange={(e) => setCrossOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          Only links that cross a domain
        </label>

        <p className="ml-auto text-xs tabular-nums text-slate-500">
          <span className="font-semibold text-slate-900">{links.length}</span> links drawn
          {hiddenCount > 0 ? <span className="text-slate-400"> &middot; {hiddenCount} weaker ones hidden</span> : null}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-2xl bg-[#04162a] ring-1 ring-slate-900/10">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="xMidYMid slice"
            style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
            className="block w-full cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={handleBackgroundPointerDown}
            onPointerMove={(e) => {
              handleBackgroundPointerMove(e);
              handleNodePointerMove(e);
            }}
            onPointerUp={handleBackgroundPointerUp}
            onPointerLeave={handleBackgroundPointerUp}
            onWheel={handleWheel}
          >
            <defs>
              <radialGradient id="netDeep" cx="50%" cy="42%" r="78%">
                <stop offset="0%" stopColor="#0d2f4b" />
                <stop offset="55%" stopColor="#08243c" />
                <stop offset="100%" stopColor="#04162a" />
              </radialGradient>
              {DOMAINS.map((d) => (
                <radialGradient key={d} id={`halo-${d}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={DOMAIN_COLORS[d]} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={DOMAIN_COLORS[d]} stopOpacity={0} />
                </radialGradient>
              ))}
              <marker
                id="lineageArrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#e2e8f0" />
              </marker>
            </defs>

            <rect width={WIDTH} height={HEIGHT} fill="url(#netDeep)" />

            {/* Domain territories: a soft halo and a name, so the ring reads as
                five places before a single node is examined. */}
            <g pointerEvents="none">
              {DOMAINS.map((d) => {
                const a = ANCHORS[d];
                const faded = focusDomain != null && focusDomain !== d;
                return (
                  <g key={d} opacity={faded ? 0.25 : 1}>
                    <circle cx={a.x} cy={a.y} r={150} fill={`url(#halo-${d})`} />
                  </g>
                );
              })}
            </g>

            <g ref={zoomGroupRef} transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
              {links.map((l) => {
                const sourceId = linkEndId(l.source);
                const targetId = linkEndId(l.target);
                const i = l.index!;
                const isSelected = activeLinkIndex === i;
                const touchesActive = activeId != null && (sourceId === activeId || targetId === activeId);
                const dimmed = activeId != null && !touchesActive;
                const stroke = isSelected
                  ? '#f8fafc'
                  : l.kind === 'lineage'
                    ? '#cbd5e1'
                    : l.crossDomain
                      ? '#fbbf24'
                      : '#5b93c0';
                const base =
                  l.kind === 'lineage' ? 2 : 0.7 + Math.min(l.weight, 6) * 0.42;
                return (
                  <g
                    key={i}
                    ref={(el) => {
                      if (!el) {
                        linkRefs.current.delete(i);
                        return;
                      }
                      const hit = el.querySelector('.hit') as SVGLineElement | null;
                      const vis = el.querySelector('.vis') as SVGLineElement | null;
                      if (hit && vis) linkRefs.current.set(i, [hit, vis]);
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
                      stroke={stroke}
                      strokeWidth={isSelected ? base + 1.6 : base}
                      strokeLinecap="round"
                      strokeDasharray={l.kind === 'theme' && l.weight < 2 ? '3 4' : undefined}
                      markerEnd={l.kind === 'lineage' ? 'url(#lineageArrow)' : undefined}
                      opacity={
                        dimmed
                          ? 0.07
                          : isSelected
                            ? 1
                            : touchesActive
                              ? 0.95
                              : l.kind === 'lineage'
                                ? 0.7
                                : l.crossDomain
                                  ? 0.55
                                  : 0.3
                      }
                      pointerEvents="none"
                    />
                  </g>
                );
              })}

              {nodes.map((n) => {
                const dimmed = nodeDimmed(n);
                const color = DOMAIN_COLORS[n.primary];
                const isSelected = selection?.type === 'node' && selection.id === n.id;
                const isActive = activeId === n.id;
                const showLabel = isActive || isSelected || labelledIds.has(n.id) || activeNeighbors?.has(n.id);
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
                    opacity={dimmed ? 0.16 : 1}
                    className="cursor-pointer"
                  >
                    {isActive || isSelected ? (
                      <circle r={n.radius + 9} fill={color} opacity={0.22} />
                    ) : null}
                    {/* An outer ring marks the records that are analysis-ready,
                        the same "usable today" cut the overview leads with. */}
                    {n.ready ? (
                      <circle r={n.radius + 3.5} fill="none" stroke={color} strokeWidth={1.2} opacity={0.6} />
                    ) : null}
                    <circle
                      r={n.radius}
                      fill={color}
                      stroke={isSelected ? '#ffffff' : '#04162a'}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                    />
                    {n.degree === 0 ? (
                      <circle r={n.radius * 0.42} fill="#04162a" opacity={0.85} />
                    ) : null}
                    {showLabel ? (
                      <text
                        y={n.radius + 14}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={isActive || isSelected ? 600 : 400}
                        fill={isActive || isSelected ? '#f8fafc' : '#b6cbdd'}
                        className="pointer-events-none select-none"
                        style={{ paintOrder: 'stroke', stroke: '#04162a', strokeWidth: 3.5 }}
                      >
                        {n.title.length > 22 ? `${n.title.slice(0, 22)}…` : n.title}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>

            {/* Territory names sit above the zoom group so they stay legible
                and stay put while the graph is panned. */}
            <g pointerEvents="none">
              {DOMAINS.map((d) => {
                const faded = focusDomain != null && focusDomain !== d;
                const raw = labelPosition(ANCHORS[d].angle);
                const text = DOMAIN_LABELS[d].toUpperCase();
                const w = text.length * 7.6 + 26;
                // Hold the whole plate inside the frame, not just its centre.
                const x = Math.max(w / 2 + 10, Math.min(WIDTH - w / 2 - 10, raw.x));
                const y = Math.max(23, Math.min(HEIGHT - 13, raw.y));
                return (
                  <g key={d} opacity={faded ? 0.32 : 1}>
                    <rect
                      x={x - w / 2}
                      y={y - 13}
                      width={w}
                      height={22}
                      rx={11}
                      fill="#04162a"
                      opacity={0.82}
                      stroke={DOMAIN_COLORS[d]}
                      strokeOpacity={0.35}
                    />
                    <text
                      x={x}
                      y={y + 2}
                      textAnchor="middle"
                      fontSize={10.5}
                      fontWeight={700}
                      letterSpacing="0.16em"
                      fill={DOMAIN_COLORS[d]}
                    >
                      {text}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-[#04162a] px-4 py-2.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 rounded bg-slate-300" /> lineage, derived from
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 rounded bg-amber-400" /> shared terms across domains
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 rounded bg-[#5b93c0]" /> shared terms within a domain
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-slate-400 ring-offset-2 ring-offset-[#04162a]" />
              analysis-ready
            </span>
            <span className="ml-auto">Drag a node &middot; scroll to zoom &middot; click a node or a line</span>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/80">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Domains</p>
            <ul className="space-y-0.5">
              {DOMAINS.map((d) => {
                const count = nodes.filter((n) => n.domain.includes(d)).length;
                const on = focusDomain === d;
                return (
                  <li key={d}>
                    <button
                      type="button"
                      onClick={() => setFocusDomain(on ? null : d)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition ${
                        on ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: DOMAIN_COLORS[d] }}
                        aria-hidden
                      />
                      <span className="truncate">{DOMAIN_LABELS[d]}</span>
                      <span className="ml-auto tabular-nums text-slate-400">{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {selectedSource ? (
            <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/80">
              <div className="mb-2 flex flex-wrap gap-1">
                {selectedSource.domain.map((d) => (
                  <span
                    key={d}
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: DOMAIN_COLORS[d] }}
                  >
                    {DOMAIN_LABELS[d]}
                  </span>
                ))}
              </div>
              <h3 className="text-sm font-semibold leading-snug text-slate-900">{selectedSource.title}</h3>
              <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-600">{selectedSource.abstract}</p>

              {selectedNeighbors.length > 0 ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Joins to {selectedNeighbors.length}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {selectedNeighbors.slice(0, 6).map(({ source, weight }) => (
                      <li key={source.id} className="flex items-baseline gap-2 text-xs">
                        <span
                          className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: DOMAIN_COLORS[source.domain[0]] }}
                          aria-hidden
                        />
                        <Link href={`/sources/${source.id}`} className="truncate text-slate-700 hover:text-violet-700 hover:underline">
                          {source.title}
                        </Link>
                        <span className="ml-auto shrink-0 tabular-nums text-slate-400">{weight}</span>
                      </li>
                    ))}
                  </ul>
                  {selectedNeighbors.length > 6 ? (
                    <p className="mt-1.5 text-[11px] text-slate-400">and {selectedNeighbors.length - 6} more</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  Nothing else in the catalog shares {minWeight === 1 ? 'a term' : `${minWeight} terms`} with this
                  record. Lower the threshold to see its weaker links.
                </p>
              )}

              <Link
                href={`/sources/${selectedSource.id}`}
                className="mt-3 inline-block text-xs font-medium text-violet-700 hover:underline"
              >
                Open the full record &rarr;
              </Link>
            </div>
          ) : selectedLink && selectedLinkSource && selectedLinkTarget ? (
            <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/80">
              <div className="flex flex-wrap gap-1">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    selectedLink.kind === 'lineage' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {selectedLink.kind === 'lineage' ? 'Lineage' : `${selectedLink.weight} shared terms`}
                </span>
                {selectedLink.crossDomain ? (
                  <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    Crosses a domain
                  </span>
                ) : null}
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-slate-400">{selectedLink.kind === 'lineage' ? 'From' : 'Between'}</span>
                  <p className="font-medium leading-snug text-slate-900">{selectedLinkSource.title}</p>
                </div>
                <div>
                  <span className="text-slate-400">{selectedLink.kind === 'lineage' ? 'To' : 'And'}</span>
                  <p className="font-medium leading-snug text-slate-900">{selectedLinkTarget.title}</p>
                </div>
              </div>

              {selectedLink.kind === 'lineage' ? (
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  <span className="font-medium">{selectedLinkTarget.title}</span> names{' '}
                  <span className="font-medium">{selectedLinkSource.title}</span> in its{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5">provenance.derived_from</code> field. This is a
                  recorded relationship, not an inferred one.
                </p>
              ) : (
                <div className="mt-3">
                  <p className="text-xs text-slate-600">Vocabulary the two records have in common:</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1">
                    {(showAllThemes
                      ? selectedLink.sharedThemes
                      : selectedLink.sharedThemes?.slice(0, SHARED_THEMES_PREVIEW)
                    )?.map((t) => (
                      <li
                        key={t}
                        className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-inset ring-slate-200"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                  {(selectedLink.sharedThemes?.length ?? 0) > SHARED_THEMES_PREVIEW && (
                    <button
                      onClick={() => setShowAllThemes((v) => !v)}
                      className="mt-2 text-xs font-medium text-violet-700 hover:underline"
                    >
                      {showAllThemes ? 'Show fewer' : `Show all ${selectedLink.sharedThemes?.length}`}
                    </button>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Shared vocabulary suggests a join. It does not guarantee the two records line up in space, time or
                    units, so check both before merging them.
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-1 border-t border-slate-100 pt-3">
                <Link href={`/sources/${selectedLinkSource.id}`} className="text-xs font-medium text-violet-700 hover:underline">
                  Open the first record &rarr;
                </Link>
                <Link href={`/sources/${selectedLinkTarget.id}`} className="text-xs font-medium text-violet-700 hover:underline">
                  Open the second record &rarr;
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs leading-relaxed text-slate-500">
              Hover a node to light up everything it joins to. Click one for its neighbours, or click a line to see the
              vocabulary two records share. A hollow centre means a record has no link at this threshold.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
