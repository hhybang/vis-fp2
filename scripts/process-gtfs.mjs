import { readFileSync, writeFileSync } from 'fs'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const GTFS = 'mbta_gtfs_full'
const OUT = 'public/data'

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',')
  return lines.slice(1).map((line) => {
    const cols = line.split(',')
    const obj = {}
    headers.forEach((h, i) => (obj[h.trim()] = (cols[i] || '').trim()))
    return obj
  })
}

// 1. Routes: all types (0=light rail, 1=heavy rail, 2=commuter rail, 3=bus)
const routes = {}
parseCSV(readFileSync(`${GTFS}/routes.txt`, 'utf-8')).forEach((r) => {
  const type = parseInt(r.route_type)
  routes[r.route_id] = { color: '#' + r.route_color, type }
})
console.log(`${Object.keys(routes).length} transit routes`)

// 2. Trips: one sample trip + shape per route
const routeShapes = {}
const sampleTrips = new Map()

parseCSV(readFileSync(`${GTFS}/trips.txt`, 'utf-8')).forEach((t) => {
  if (!routes[t.route_id]) return
  const rid = t.route_id
  if (!routeShapes[rid]) routeShapes[rid] = new Set()
  routeShapes[rid].add(t.shape_id)
  if (!sampleTrips.has(rid)) sampleTrips.set(rid, t.trip_id)
})

const neededShapes = new Set()
for (const s of Object.values(routeShapes)) s.forEach((id) => neededShapes.add(id))
console.log(`${neededShapes.size} shapes needed`)

// 3. Shapes → polylines (only for needed shapes)
const shapePoints = {}
parseCSV(readFileSync(`${GTFS}/shapes.txt`, 'utf-8')).forEach((s) => {
  if (!neededShapes.has(s.shape_id)) return
  if (!shapePoints[s.shape_id]) shapePoints[s.shape_id] = []
  shapePoints[s.shape_id].push({
    seq: parseInt(s.shape_pt_sequence),
    coord: [parseFloat(s.shape_pt_lon), parseFloat(s.shape_pt_lat)],
  })
})

for (const pts of Object.values(shapePoints)) pts.sort((a, b) => a.seq - b.seq)
console.log(`Built ${Object.keys(shapePoints).length} polylines`)

// Pick max 2 shapes per route (one per direction) to keep the file small
const features = []
for (const [rid, shapeSet] of Object.entries(routeShapes)) {
  const ids = [...shapeSet].filter((id) => shapePoints[id]).slice(0, 2)
  ids.forEach((shapeId) => {
    features.push({
      type: 'Feature',
      properties: { route_id: rid, color: routes[rid].color },
      geometry: {
        type: 'LineString',
        coordinates: shapePoints[shapeId].map((p) => p.coord),
      },
    })
  })
}

writeFileSync(
  `${OUT}/mbta_routes.json`,
  JSON.stringify({ type: 'FeatureCollection', features })
)
console.log(`Wrote ${features.length} route line features`)

// 4. Stop→route color mapping via stop_times.txt (streaming)
const targetTrips = new Set(sampleTrips.values())
const tripToRoute = {}
sampleTrips.forEach((tid, rid) => (tripToRoute[tid] = rid))

async function buildStopColors() {
  const stopRoutes = {}
  const rl = createInterface({
    input: createReadStream(`${GTFS}/stop_times.txt`),
    crlfDelay: Infinity,
  })

  let headers = null
  let count = 0

  for await (const line of rl) {
    if (!headers) {
      headers = line.split(',').map((h) => h.trim())
      continue
    }
    const cols = line.split(',')
    const tripId = cols[headers.indexOf('trip_id')]?.trim()
    if (!targetTrips.has(tripId)) continue

    const stopId = cols[headers.indexOf('stop_id')]?.trim()
    const routeId = tripToRoute[tripId]
    if (stopId && routeId && !stopRoutes[stopId]) {
      stopRoutes[stopId] = routes[routeId].color
      count++
    }
  }

  writeFileSync(`${OUT}/mbta_stop_colors.json`, JSON.stringify(stopRoutes))
  console.log(`Mapped ${count} stops to route colors`)
}

await buildStopColors()
console.log('Done!')
