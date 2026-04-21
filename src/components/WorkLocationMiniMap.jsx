import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Small map for onboarding: user clicks once to set workplace coordinates.
 */
export default function WorkLocationMiniMap({ location, onLocationChange }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onLocationChange)
  onChangeRef.current = onLocationChange

  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return

    const center = location ? [location.lat, location.lng] : [42.36, -71.06]
    const map = L.map(mapRef.current, {
      center,
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map)

    map.on('click', (e) => {
      const { lat, lng } = e.latlng
      onChangeRef.current({ lat, lng })
    })

    mapInstanceRef.current = map
    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !location) return

    if (markerRef.current) {
      map.removeLayer(markerRef.current)
    }
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;background:#1a1a2e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.25)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    })
    markerRef.current = L.marker([location.lat, location.lng], { icon }).addTo(map)
    map.setView([location.lat, location.lng], Math.max(map.getZoom(), 13))
  }, [location])

  return (
    <div className="work-map-wrap">
      <p className="work-map-hint">Click the map to drop your workplace. You can pan and zoom first.</p>
      <div ref={mapRef} className="work-map-el" role="application" aria-label="Map to choose workplace" />
    </div>
  )
}
