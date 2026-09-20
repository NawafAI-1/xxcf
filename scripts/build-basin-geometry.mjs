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
const topology = require('world-atlas/countries-10m.json');

const REGION = { west: 30.5, south: 9.5, east: 47.5, north: 31.5 };
const PRECISION = 1000; // three decimals, about 100 m
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

function clipPolygon(rings) {
  const clipped = rings.map(clipRing).filter((r) => r && r.length >= 4);
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
console.log(`${features.length} countries clipped to the region -> ${OUT} (${kb} KB)`);
console.log(features.map((f) => f.properties.name).join(', '));
