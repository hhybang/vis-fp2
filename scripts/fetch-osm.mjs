const STOPS = [
  { name: 'Harvard Square',   line: 'Red Line',    lat: 42.3734, lon: -71.1189 },
  { name: 'Park Street',      line: 'Red / Green', lat: 42.3564, lon: -71.0624 },
  { name: 'Back Bay',         line: 'Orange Line', lat: 42.3474, lon: -71.0757 },
  { name: 'Davis Square',     line: 'Red Line',    lat: 42.3967, lon: -71.1225 },
  { name: 'Maverick',         line: 'Blue Line',   lat: 42.3691, lon: -71.0395 },
  { name: 'Kendall/MIT',      line: 'Red Line',    lat: 42.3625, lon: -71.0862 },
  { name: 'Forest Hills',    line: 'Orange Line', lat: 42.3006, lon: -71.1135 },
  { name: 'Andrew',           line: 'Red Line',    lat: 42.3302, lon: -71.0573 },
  { name: 'Central Square',   line: 'Red Line',    lat: 42.3653, lon: -71.1037 },
  { name: 'Coolidge Corner',  line: 'Green Line',  lat: 42.3420, lon: -71.1221 },
];

const RADIUS = 800;
const WALK_MIN = 10;

const CATEGORIES = {
  grocery:   ['supermarket', 'convenience', 'greengrocer', 'bakery'],
  food:      ['cafe', 'restaurant', 'fast_food'],
  pharmacy:  ['pharmacy'],
  health:    ['clinic', 'doctors', 'hospital'],
  education: ['school', 'kindergarten', 'childcare'],
  park:      ['park', 'playground'],
  fitness:   ['fitness_centre'],
  finance:   ['bank', 'post_office'],
  library:   ['library'],
};

function categorize(tags) {
  if (tags.healthcare) return 'health';
  const type = tags.amenity || tags.shop || tags.leisure;
  for (const [cat, types] of Object.entries(CATEGORIES)) {
    if (types.includes(type)) return cat;
  }
  return 'other';
}

async function fetchStop(stop) {
  const query = `[out:json][timeout:30];
(
  node["amenity"~"pharmacy|clinic|doctors|hospital|cafe|restaurant|fast_food|bank|post_office|library|childcare|kindergarten|school"](around:${RADIUS},${stop.lat},${stop.lon});
  node["shop"~"supermarket|convenience|bakery|greengrocer"](around:${RADIUS},${stop.lat},${stop.lon});
  node["leisure"~"park|playground|fitness_centre"](around:${RADIUS},${stop.lat},${stop.lon});
  node["healthcare"](around:${RADIUS},${stop.lat},${stop.lon});
  way["leisure"="park"](around:${RADIUS},${stop.lat},${stop.lon});
  way["shop"~"supermarket|convenience"](around:${RADIUS},${stop.lat},${stop.lon});
  way["amenity"~"pharmacy|clinic|doctors|hospital|school|kindergarten"](around:${RADIUS},${stop.lat},${stop.lon});
);
out center;`;

  const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
  const res = await fetch(url, {
    headers: { 'Accept': '*/*', 'User-Agent': 'fp3-project/1.0' },
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`  FAILED ${stop.name}: ${res.status}`);
    return null;
  }
  const data = JSON.parse(text);

  const seen = new Set();
  const amenities = [];

  for (const el of data.elements) {
    const name = el.tags.name || el.tags.amenity || el.tags.shop || el.tags.leisure || el.tags.healthcare;
    const lat = el.lat || el.center?.lat;
    const lon = el.lon || el.center?.lon;
    if (!lat || !lon) continue;

    const key = `${name}-${lat.toFixed(4)}-${lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    amenities.push({
      name,
      type: el.tags.amenity || el.tags.shop || el.tags.leisure || el.tags.healthcare,
      category: categorize(el.tags),
      lat,
      lon,
    });
  }

  const counts = {};
  for (const a of amenities) {
    counts[a.category] = (counts[a.category] || 0) + 1;
  }

  return {
    stop: { ...stop, radius_m: RADIUS, walk_minutes: WALK_MIN },
    counts,
    total: amenities.length,
    amenities,
  };
}

const results = [];
for (const stop of STOPS) {
  console.log(`Fetching ${stop.name}...`);
  const result = await fetchStop(stop);
  if (result) {
    results.push(result);
    console.log(`  ${result.total} amenities`);
  }
  // Small delay to be polite to the Overpass API
  await new Promise((r) => setTimeout(r, 1500));
}

const output = {
  stops: results,
  source: 'OpenStreetMap via Overpass API',
  fetched: new Date().toISOString().slice(0, 10),
};

const fs = await import('fs');
fs.writeFileSync(
  new URL('../public/data/osm_daily_needs.json', import.meta.url),
  JSON.stringify(output, null, 2)
);

console.log(`\nWrote osm_daily_needs.json with ${results.length} stops`);
