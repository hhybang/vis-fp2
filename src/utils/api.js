import * as turf from '@turf/turf'

const ORS_KEY = import.meta.env.VITE_OPENROUTE_KEY
const TT_APP_ID = import.meta.env.VITE_TRAVELTIME_APP_ID
const TT_API_KEY = import.meta.env.VITE_TRAVELTIME_API_KEY

/** Rough km/h for ring radii when OpenRoute / TravelTime are unavailable (not real network isochrones). */
function speedKmhForApproxMode(mode) {
  if (mode === 'driving-car') return 32
  if (mode === 'public_transport') return 10
  return 5
}

/**
 * Circular stand-in for real isochrones so the map and charts work without API keys (e.g. GitHub Pages).
 */
function buildApproximateIsochrone(lat, lng, mode, intervals = [600, 1200, 1800]) {
  const speedKmh = speedKmhForApproxMode(mode)
  const center = turf.point([lng, lat])
  const features = intervals.map((seconds) => {
    const radiusKm = (seconds / 3600) * speedKmh
    const circle = turf.circle(center, radiusKm, { steps: 64, units: 'kilometers' })
    circle.properties = { value: seconds, center: [lng, lat] }
    return circle
  })
  return {
    type: 'FeatureCollection',
    features: features.sort((a, b) => b.properties.value - a.properties.value),
  }
}

async function fetchOpenRouteIsochrone(lat, lng, profile, intervals) {
  const url = `https://api.openrouteservice.org/v2/isochrones/${profile}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: ORS_KEY,
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

async function fetchIsochroneDrivingOrWalking(lat, lng, mode, intervals) {
  const profile = mode === 'foot-walking' ? 'foot-walking' : 'driving-car'
  if (!ORS_KEY) {
    return buildApproximateIsochrone(lat, lng, mode, intervals)
  }
  try {
    return await fetchOpenRouteIsochrone(lat, lng, profile, intervals)
  } catch (e) {
    console.warn('OpenRoute isochrone failed, using approximate rings:', e)
    return buildApproximateIsochrone(lat, lng, mode, intervals)
  }
}

/** Greater Boston-ish bounding box for Photon (minLon,minLat,maxLon,maxLat) */
const PHOTON_BBOX = '-71.55,42.15,-70.85,42.55'

function formatPhotonLabel(props) {
  const streetLine = [props.housenumber, props.street].filter(Boolean).join(' ').trim()
  const place = [props.city || props.town || props.district, props.state].filter(Boolean).join(', ')
  if (streetLine && place) return `${streetLine}, ${place}`
  if (props.name && place) return `${props.name}, ${place}`
  if (props.name) return props.name
  if (place) return place
  return 'Selected location'
}

function photonFeaturesToSuggestions(features) {
  return features.map((f) => {
    const [lng, lat] = f.geometry.coordinates
    return {
      label: formatPhotonLabel(f.properties || {}),
      lat,
      lng,
    }
  })
}

async function photonAutocomplete(text) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=8&bbox=${PHOTON_BBOX}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  const features = data.features || []
  return photonFeaturesToSuggestions(features)
}

async function photonGeocode(query) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&bbox=${PHOTON_BBOX}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Photon geocode failed')
  const data = await res.json()
  const f = data.features?.[0]
  if (!f) throw new Error('Could not geocode address')
  const [lng, lat] = f.geometry.coordinates
  return { lat, lng }
}

export async function reverseGeocodeLabel(lat, lng) {
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const f = data.features?.[0]
    if (!f) return null
    return formatPhotonLabel(f.properties || {})
  } catch {
    return null
  }
}

export async function autocompleteAddress(text) {
  const q = text.trim()
  if (!q) return []

  if (ORS_KEY) {
    try {
      const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${ORS_KEY}&text=${encodeURIComponent(q)}&boundary.country=US&boundary.rect.min_lon=-71.5&boundary.rect.min_lat=42.0&boundary.rect.max_lon=-70.8&boundary.rect.max_lat=42.7&size=8`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        if (data.features?.length) {
          return data.features.map((f) => ({
            label: f.properties.label,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
          }))
        }
      }
    } catch {
      /* fall through to Photon */
    }
  }

  return photonAutocomplete(q)
}

export async function geocodeAddress(address) {
  const q = address.trim()
  if (!q) throw new Error('Could not geocode address')

  if (ORS_KEY) {
    try {
      const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_KEY}&text=${encodeURIComponent(q)}&boundary.country=US&size=1`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        if (data.features?.length) {
          const [lng, lat] = data.features[0].geometry.coordinates
          return { lat, lng }
        }
      }
    } catch {
      /* fall through */
    }
  }

  return photonGeocode(q)
}

export async function fetchIsochrone(lat, lng, mode, intervals = [600, 1200, 1800]) {
  if (mode === 'public_transport') {
    return fetchTransitIsochrone(lat, lng, intervals)
  }
  return fetchIsochroneDrivingOrWalking(lat, lng, mode, intervals)
}

function approximateTransitFallback(lat, lng, intervals, reason) {
  if (reason) console.warn('[transit isochrone]', reason)
  return buildApproximateIsochrone(lat, lng, 'public_transport', intervals)
}

async function fetchTransitIsochrone(lat, lng, intervals) {
  const hasTravelTimeCreds =
    TT_APP_ID &&
    TT_API_KEY &&
    String(TT_APP_ID).trim() !== '' &&
    String(TT_API_KEY).trim() !== ''

  if (!hasTravelTimeCreds) {
    return approximateTransitFallback(
      lat,
      lng,
      intervals,
      'TravelTime credentials missing (set TRAVELTIME_APP_ID and TRAVELTIME_API_KEY for real transit isochrones). Using approximate reach rings.',
    )
  }

  const departureTime = new Date()
  departureTime.setHours(8, 0, 0, 0)
  if (departureTime < new Date()) {
    departureTime.setDate(departureTime.getDate() + 1)
  }

  try {
    const res = await fetch('https://api.traveltimeapp.com/v4/time-map', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Application-Id': TT_APP_ID,
        'X-Api-Key': TT_API_KEY,
      },
      body: JSON.stringify({
        departure_searches: intervals.map((seconds) => ({
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
      return approximateTransitFallback(
        lat,
        lng,
        intervals,
        `TravelTime HTTP ${res.status}: ${err.slice(0, 200)}`,
      )
    }

    const data = await res.json()
    if (!data.results?.length) {
      return approximateTransitFallback(lat, lng, intervals, 'TravelTime returned no results.')
    }

    const features = data.results
      .map((result) => {
        if (!result.shapes?.length) return null
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
        const idStr = String(result.search_id || '')
        const idMatch = idStr.match(/_(\d+)$/)
        const seconds = idMatch ? parseInt(idMatch[1], 10) : parseInt(idStr, 10) || 0
        return {
          type: 'Feature',
          properties: { value: seconds, center: [lng, lat] },
          geometry: {
            type: shells.length === 1 ? 'Polygon' : 'MultiPolygon',
            coordinates: shells.length === 1 ? shells[0] : shells,
          },
        }
      })
      .filter(Boolean)

    if (!features.length) {
      return approximateTransitFallback(lat, lng, intervals, 'TravelTime shapes were empty.')
    }

    return {
      type: 'FeatureCollection',
      features: features.sort((a, b) => b.properties.value - a.properties.value),
    }
  } catch (e) {
    return approximateTransitFallback(
      lat,
      lng,
      intervals,
      `TravelTime request failed: ${e?.message || e}`,
    )
  }
}

async function fetchDirectionsOsrm(fromLat, fromLng, toLat, toLng, profile) {
  const osrmProfile = profile === 'driving-car' ? 'car' : 'foot'
  const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error('OSRM directions failed')
  const data = await res.json()
  const route = data.routes?.[0]
  if (!route) throw new Error('No route')
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          summary: { duration: route.duration },
        },
        geometry: route.geometry,
      },
    ],
  }
}

function fetchDirectionsStraightLine(fromLat, fromLng, toLat, toLng, profile) {
  const from = turf.point([fromLng, fromLat])
  const to = turf.point([toLng, toLat])
  const km = turf.distance(from, to, { units: 'kilometers' })
  const speedKmh = profile === 'driving-car' ? 35 : 5
  const duration = (km / speedKmh) * 3600
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { summary: { duration } },
        geometry: {
          type: 'LineString',
          coordinates: [
            [fromLng, fromLat],
            [toLng, toLat],
          ],
        },
      },
    ],
  }
}

export async function fetchDirections(fromLat, fromLng, toLat, toLng, profile = 'foot-walking') {
  if (ORS_KEY) {
    try {
      const url = `https://api.openrouteservice.org/v2/directions/${profile}?api_key=${ORS_KEY}&start=${fromLng},${fromLat}&end=${toLng},${toLat}`
      const res = await fetch(url)
      if (res.ok) return res.json()
    } catch (e) {
      console.warn('OpenRoute directions failed:', e)
    }
  }
  try {
    return await fetchDirectionsOsrm(fromLat, fromLng, toLat, toLng, profile)
  } catch (e) {
    console.warn('OSRM directions failed, using straight-line estimate:', e)
    return fetchDirectionsStraightLine(fromLat, fromLng, toLat, toLng, profile)
  }
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
  const res = await fetch(import.meta.env.BASE_URL + 'data/boston_tracts.geojson')
  if (!res.ok) throw new Error('Failed to load tract boundaries')
  return res.json()
}
