// Extracts the Red Sea region's coastline from Natural Earth (public domain,
// via the world-atlas package) and writes it into the repo as a small GeoJSON
// file. Run at build time, never at run time: the site ships the geometry and
// makes no request for it.
//
//   node scripts/build-basin-geometry.mjs
//
// Sutherland-Hodgman clips each ring to the region, so what lands in the file
// is the coastline of the basin rather than the whole of Africa and Asia.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
// 50m rather than 10m: at a frame this wide the extra detail is invisible
// and costs three times the bytes every visitor downloads.
const topology = require('world-atlas/countries-50m.json');

// The region is read off the catalogue rather than written down here, so the
// map can follow the work. Add records from another sea, re-run this script,
// and the coastline file widens to hold them; nothing in the map component is
// pinned to the Red Sea. A floor keeps the neighbours of this basin on the map
// even while every record sits inside it.
const MARGIN = 6; // degrees of context to keep around the outermost record
const FLOOR = { west: 22, south: 3, east: 54, north: 34 };
/**
 * A record wider than this describes several seas at once rather than a place.
 * Two do in this catalogue, reaching the Mediterranean and the Indian Ocean,
 * and framing on them would shrink the basin everyone actually works in to a
 * sliver. They are listed on the map page instead of steering the map.
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
    // A global extent says nothing about where the work is, and a 0,0,0,0
    // placeholder is not a place.
    if (e - w >= 340 && n - s >= 160) continue;
    if (e - w > SINGLE_SEA || n - s > SINGLE_SEA) continue;
    if (w === 0 && s === 0 && e === 0 && n === 0) continue;
    west = Math.min(west, w);
    south = Math.min(south, s);
    east = Math.max(east, e);
    north = Math.max(north, n);
  }

  if (!Number.isFinite(west)) return FLOOR;
  const bound = (value, low, high) => Math.min(Math.max(value, low), high);
  return {
    west: bound(Math.min(FLOOR.west, west - MARGIN), -180, 180),
    south: bound(Math.min(FLOOR.south, south - MARGIN), -85, 85),
    east: bound(Math.max(FLOOR.east, east + MARGIN), -180, 180),
    north: bound(Math.max(FLOOR.north, north + MARGIN), -85, 85),
  };
}

const REGION = regionFromCatalogue();
const PRECISION = 200; // 0.005 degrees, about 550 m: enough at this scale
const OUT = path.join('src', 'lib', 'basin-land.json');

const inside = ([x, y], edge) => {
  if (edge === 'west') return x >= REGION.west;
  if (edge === 'east') return x <= REGION.east;
  if (edge === 'south') return y >= REGION.south;
  return y <= REGION.north;
};

const intersect = (a, b, edge) => {
  const [x1, y1] = a;
  const [x2, y2] = b;
  if (edge === 'west' || edge === 'east') {
    const x = edge === 'west' ? REGION.west : REGION.east;
    return [x, y1 + ((y2 - y1) * (x - x1)) / (x2 - x1)];
  }
  const y = edge === 'south' ? REGION.south : REGION.north;
  return [x1 + ((x2 - x1) * (y - y1)) / (y2 - y1), y];
};

function clipRing(ring) {
  let output = ring;
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
    Math.round(x * PRECISION) / PRECISION,
    Math.round(y * PRECISION) / PRECISION,
  ]);
}

/** Rough area of a ring in square degrees, for dropping specks. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

const MIN_AREA = 0.004; // about 50 km2: below this nothing is visible here

function clipPolygon(rings) {
  const clipped = rings
    .map(clipRing)
    .filter((r) => r && r.length >= 4 && ringArea(r) >= MIN_AREA);
  return clipped.length ? clipped : null;
}

const countries = feature(topology, topology.objects.countries);
const features = [];

for (const country of countries.features) {
  const polygons =
    country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
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

const collection = { type: 'FeatureCollection', region: REGION, features };
fs.writeFileSync(OUT, JSON.stringify(collection));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(
  `region from the catalogue: ${REGION.west} to ${REGION.east}E, ${REGION.south} to ${REGION.north}N`
);
console.log(`${features.length} countries clipped to the region -> ${OUT} (${kb} KB)`);
console.log(features.map((f) => f.properties.name).join(', '));
