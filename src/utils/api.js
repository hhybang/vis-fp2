const ORS_KEY = import.meta.env.VITE_OPENROUTE_KEY
const TT_APP_ID = import.meta.env.VITE_TRAVELTIME_APP_ID
const TT_API_KEY = import.meta.env.VITE_TRAVELTIME_API_KEY

export async function autocompleteAddress(text) {
  const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${ORS_KEY}&text=${encodeURIComponent(text)}&boundary.country=US&boundary.rect.min_lon=-71.5&boundary.rect.min_lat=42.0&boundary.rect.max_lon=-70.8&boundary.rect.max_lat=42.7&size=5`
  const res = await fetch(url)
  const data = await res.json()
  if (data.features) {
    return data.features.map((f) => ({
      label: f.properties.label,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }))
  }
  return []
}

export async function geocodeAddress(address) {
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_KEY}&text=${encodeURIComponent(address)}&boundary.country=US&size=1`
  const res = await fetch(url)
  const data = await res.json()
  if (data.features && data.features.length > 0) {
    const [lng, lat] = data.features[0].geometry.coordinates
    return { lat, lng }
  }
  throw new Error('Could not geocode address')
}

export async function fetchIsochrone(lat, lng, mode, intervals = [600, 1200, 1800]) {
  if (mode === 'public_transport') {
    return fetchTransitIsochrone(lat, lng, intervals)
  }
  const profile = mode === 'foot-walking' ? 'foot-walking' : 'driving-car'
  const url = `https://api.openrouteservice.org/v2/isochrones/${profile}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': ORS_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      locations: [[lng, lat]],
      range: intervals,
      range_type: 'time',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Isochrone API error: ${err}`)
  }
  return res.json()
}

async function fetchTransitIsochrone(lat, lng, intervals) {
  const departureTime = new Date()
  departureTime.setHours(8, 0, 0, 0)
  if (departureTime < new Date()) {
    departureTime.setDate(departureTime.getDate() + 1)
  }

  const res = await fetch('https://api.traveltimeapp.com/v4/time-map', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Application-Id': TT_APP_ID,
      'X-Api-Key': TT_API_KEY,
    },
    body: JSON.stringify({
      departure_searches: intervals.map((seconds, i) => ({
        id: `iso_${seconds}`,
        coords: { lat, lng },
        departure_time: departureTime.toISOString(),
        travel_time: seconds,
        transportation: { type: 'public_transport' },
      })),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.warn('TravelTime API error, falling back to walking isochrone:', err)
    return fetchIsochrone(lat, lng, 'foot-walking', intervals)
  }

  const data = await res.json()
  const features = data.results.map((result) => {
    const shells = result.shapes.map((shape) => {
      const ring = shape.shell.map((p) => [p.lng, p.lat])
      ring.push(ring[0])
      const holes = (shape.holes || []).map((hole) => {
        const h = hole.map((p) => [p.lng, p.lat])
        h.push(h[0])
        return h
      })
      return [ring, ...holes]
    })
    const seconds = parseInt(result.search_id.split('_')[1])
    return {
      type: 'Feature',
      properties: { value: seconds, center: [lng, lat] },
      geometry: {
        type: shells.length === 1 ? 'Polygon' : 'MultiPolygon',
        coordinates: shells.length === 1 ? shells[0] : shells,
      },
    }
  })

  return {
    type: 'FeatureCollection',
    features: features.sort((a, b) => b.properties.value - a.properties.value),
  }
}

export async function fetchDirections(fromLat, fromLng, toLat, toLng, profile = 'foot-walking') {
  const url = `https://api.openrouteservice.org/v2/directions/${profile}?api_key=${ORS_KEY}&start=${fromLng},${fromLat}&end=${toLng},${toLat}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Directions API error')
  return res.json()
}

export async function fetchCensusRentData() {
  const url = 'https://api.census.gov/data/2023/acs/acs5/profile?get=GEO_ID,DP04_0134E,DP04_0126E,DP04_0127E,DP04_0128E,DP04_0129E,DP04_0130E,DP04_0131E,DP04_0132E,DP04_0133E&for=tract:*&in=state:25'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Census API error')
  const data = await res.json()
  const headers = data[0]
  return data.slice(1).map((row) => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] })
    return obj
  })
}

export async function fetchTractBoundaries() {
  // Load pre-downloaded tract boundaries for Greater Boston area
  const res = await fetch(import.meta.env.BASE_URL + 'data/boston_tracts.geojson')
  if (!res.ok) throw new Error('Failed to load tract boundaries')
  return res.json()
}
