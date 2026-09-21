// Extracts coastline from Natural Earth (public domain, via the world-atlas
// package) and writes it into the repo as GeoJSON. Run at build time, never at
// run time: the site ships the geometry and makes no request for it.
//
//   node scripts/build-basin-geometry.mjs
//
// Two sets come out of it:
//   - "world": the whole globe at 110m, coarse and small, so the map can be
//     walked anywhere rather than stopping at the edge of the work.
//   - "region": the catalogue's own neighbourhood at 50m, for the detail the
//     basin deserves when the frame is on it.
// The map picks whichever suits the frame it is drawing.
//
// Sutherland-Hodgman clips each ring to the region.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);

const WORLD = { west: -180, south: -85, east: 180, north: 85 };
const OUT = path.join('src', 'lib', 'basin-land.json');

// The region is read off the catalogue rather than written down here, so the
// detailed set follows the work. Add records from another sea, re-run this
// script, and the detail widens to hold them. A floor keeps the neighbours of
// this basin in the detailed set even while every record sits inside it.
const MARGIN = 6;
const FLOOR = { west: 22, south: 3, east: 54, north: 34 };
/**
 * A record wider than this describes several seas at once rather than a place.
 * Two do in this catalogue, reaching the Mediterranean and the Indian Ocean,
 * and framing on them would shrink the basin everyone works in to a sliver.
 */
const SINGLE_SEA = 30;

function regionFromCatalogue() {
  const dir = path.join('data', 'sources');
  if (!fs.existsSync(dir)) return FLOOR;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const record = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const box = record.spatial?.bbox;
    if (!Array.isArray(box) || box.length !== 4) continue;
    const [w, s, e, n] = box;
    if (e - w >= 340 && n - s >= 160) continue;
    if (e - w > SINGLE_SEA || n - s > SINGLE_SEA) continue;
    if (w === 0 && s === 0 && e === 0 && n === 0) continue;
    west = Math.min(west, w);
    south = Math.min(south, s);
    east = Math.max(east, e);
    north = Math.max(north, n);
  }

  if (!Number.isFinite(west)) return FLOOR;
  const bound = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  return {
    west: bound(Math.min(FLOOR.west, west - MARGIN), -180, 180),
    south: bound(Math.min(FLOOR.south, south - MARGIN), -85, 85),
    east: bound(Math.max(FLOOR.east, east + MARGIN), -180, 180),
    north: bound(Math.max(FLOOR.north, north + MARGIN), -85, 85),
  };
}

const REGION = regionFromCatalogue();

function clipper(region, precision, minArea) {
  const inside = ([x, y], edge) => {
    if (edge === 'west') return x >= region.west;
    if (edge === 'east') return x <= region.east;
    if (edge === 'south') return y >= region.south;
    return y <= region.north;
  };

  const intersect = (a, b, edge) => {
    const [x1, y1] = a;
    const [x2, y2] = b;
    if (edge === 'west' || edge === 'east') {
      const x = edge === 'west' ? region.west : region.east;
      return [x, y1 + ((y2 - y1) * (x - x1)) / (x2 - x1)];
    }
    const y = edge === 'south' ? region.south : region.north;
    return [x1 + ((x2 - x1) * (y - y1)) / (y2 - y1), y];
  };

  const ringArea = (ring) => {
    let sum = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum / 2);
  };

  /**
   * Make a ring's longitudes continuous before clipping.
   *
   * Russia and Fiji cross the antimeridian, so their rings jump from +179 to
   * -179 and the clipper reads that as an edge running the whole width of the
   * world. Carrying each point forward from the last keeps the ring in one
   * piece; whatever ends up past 180 is then clipped off at the edge, which is
   * a clean cut rather than a stripe across the map.
   */
  function unwrap(ring) {
    const out = [ring[0]];
    for (let i = 1; i < ring.length; i += 1) {
      const [x, y] = ring[i];
      const previous = out[i - 1][0];
      let lon = x;
      while (lon - previous > 180) lon -= 360;
      while (previous - lon > 180) lon += 360;
      out.push([lon, y]);
    }
    return out;
  }

  function clipRing(raw) {
    let output = unwrap(raw);
    for (const edge of ['west', 'east', 'south', 'north']) {
      const input = output;
      output = [];
      for (let i = 0; i < input.length; i += 1) {
        const current = input[i];
        const previous = input[(i + input.length - 1) % input.length];
        const currentIn = inside(current, edge);
        const previousIn = inside(previous, edge);
        if (currentIn) {
          if (!previousIn) output.push(intersect(previous, current, edge));
          output.push(current);
        } else if (previousIn) {
          output.push(intersect(previous, current, edge));
        }
      }
      if (output.length === 0) return null;
    }
    return output.map(([x, y]) => [
      Math.round(x * precision) / precision,
      Math.round(y * precision) / precision,
    ]);
  }

  return function clipPolygon(rings) {
    const clipped = rings.map(clipRing).filter((r) => r && r.length >= 4 && ringArea(r) >= minArea);
    return clipped.length ? clipped : null;
  };
}

function extract(topologyFile, region, precision, minArea) {
  const topology = require(`world-atlas/${topologyFile}`);
  const countries = feature(topology, topology.objects.countries);
  const clipPolygon = clipper(region, precision, minArea);
  const features = [];

  for (const country of countries.features) {
    const polygons =
      country.geometry.type === 'Polygon'
        ? [country.geometry.coordinates]
        : country.geometry.coordinates;
    const kept = polygons.map(clipPolygon).filter(Boolean);
    if (kept.length === 0) continue;
    features.push({
      type: 'Feature',
      properties: { name: country.properties.name },
      geometry:
        kept.length === 1
          ? { type: 'Polygon', coordinates: kept[0] }
          : { type: 'MultiPolygon', coordinates: kept },
    });
  }
  return features;
}

/** A country's extent, for working out which countries touch which. */
function bounds(feature) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const polygons =
    feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const rings of polygons) {
    for (const [x, y] of rings[0]) {
      west = Math.min(west, x);
      south = Math.min(south, y);
      east = Math.max(east, x);
      north = Math.max(north, y);
    }
  }
  return { west, south, east, north };
}

/**
 * A colour index per country, so neighbours never share one.
 *
 * Greedy graph colouring over a neighbour test that asks whether two countries'
 * extents overlap. That is coarser than a real shared border, which only makes
 * the colouring more cautious than it needs to be, and the result is stable
 * because the countries are sorted before it runs.
 */
function colourCountries(features, palette) {
  const boxes = new Map(features.map((f) => [f.properties.name, bounds(f)]));
  const order = [...features].sort((a, b) => a.properties.name.localeCompare(b.properties.name));
  const colours = new Map();

  for (const country of order) {
    const mine = boxes.get(country.properties.name);
    const taken = new Set();
    for (const [name, box] of boxes) {
      if (name === country.properties.name || !colours.has(name)) continue;
      const touches =
        mine.west <= box.east + 0.5 &&
        mine.east >= box.west - 0.5 &&
        mine.south <= box.north + 0.5 &&
        mine.north >= box.south - 0.5;
      if (touches) taken.add(colours.get(name));
    }
    let pick = 0;
    while (taken.has(pick) && pick < palette - 1) pick += 1;
    colours.set(country.properties.name, pick);
  }
  return colours;
}

const PALETTE_SIZE = 8;

const world = extract('countries-110m.json', WORLD, 20, 0.05);
const region = extract('countries-50m.json', REGION, 200, 0.004);

// One colour per country name, shared by both sets so a country keeps its
// colour when the map switches detail under a zoom.
const named = new Map();
for (const f of [...world, ...region]) if (!named.has(f.properties.name)) named.set(f.properties.name, f);
const colours = colourCountries([...named.values()], PALETTE_SIZE);
for (const f of [...world, ...region]) f.properties.color = colours.get(f.properties.name) ?? 0;

const collection = { region: REGION, world: WORLD, palette: PALETTE_SIZE, features: region, coarse: world };
fs.writeFileSync(OUT, JSON.stringify(collection));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`region from the catalogue: ${REGION.west} to ${REGION.east}E, ${REGION.south} to ${REGION.north}N`);
console.log(`${region.length} countries at 50m, ${world.length} at 110m -> ${OUT} (${kb} KB)`);
