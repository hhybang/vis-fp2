import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { loadMBTAStops } from '../utils/dataLoaders'

export default function StoryMap() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  useEffect(() => {
    if (mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: [42.34, -71.06],
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      attributionControl: false,
    })

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 19 }
    ).addTo(map)

    mapInstanceRef.current = map
    let cancelled = false

    const base = import.meta.env.BASE_URL

    Promise.all([
      fetch(base + 'data/mbta_routes.json').then((r) => r.json()),
      fetch(base + 'data/mbta_stop_colors.json').then((r) => r.json()),
      loadMBTAStops(),
    ]).then(([routeGeo, stopColors, stops]) => {
      if (cancelled || !mapInstanceRef.current) return

      // Route lines: dark brown, thinner for bus
      L.geoJSON(routeGeo, {
        style: (feature) => {
          const rid = feature.properties.route_id
          const isBus = !['Red','Orange','Blue','Green-B','Green-C','Green-D','Green-E','Mattapan'].includes(rid)
            && !rid.startsWith('CR-')
          return {
            color: '#5c4a3a',
            weight: isBus ? 1 : 2.5,
            opacity: isBus ? 0.35 : 0.7,
          }
        },
        interactive: false,
      }).addTo(map)

      // Stops: colored by their MBTA line
      stops.forEach((stop) => {
        const color = stopColors[stop.id] || '#888'
        const hasRoute = stopColors[stop.id] !== undefined
        const isBus = stop.vehicleType === 3

        L.circleMarker([stop.lat, stop.lng], {
          radius: isBus ? 1.5 : 4,
          fillColor: isBus ? '#5c4a3a' : color,
          color: isBus ? '#5c4a3a' : '#fff',
          weight: isBus ? 0 : 1.5,
          fillOpacity: isBus ? 0.4 : 0.95,
        }).addTo(map)
      })
    })

    return () => {
      cancelled = true
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  return <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
}
