import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'

const CAT_META = {
  food:      { label: 'Food & Cafés',   color: '#d35400', icon: '🍽' },
  grocery:   { label: 'Grocery',         color: '#27ae60', icon: '🛒' },
  park:      { label: 'Parks',           color: '#2ecc71', icon: '🌳' },
  health:    { label: 'Health',          color: '#e74c3c', icon: '🏥' },
  education: { label: 'Schools',         color: '#8e44ad', icon: '🎓' },
  library:   { label: 'Libraries',       color: '#2980b9', icon: '📚' },
  finance:   { label: 'Banks & Post',    color: '#7f8c8d', icon: '🏦' },
  fitness:   { label: 'Fitness',         color: '#e67e22', icon: '💪' },
  pharmacy:  { label: 'Pharmacy',        color: '#e74c3c', icon: '💊' },
}

const DISPLAY_ORDER = ['grocery', 'food', 'park', 'health', 'pharmacy', 'education', 'library', 'finance', 'fitness']

export default function DailyNeedsPanel({ visible, onStopChange }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersLayer = useRef(null)
  const [allStops, setAllStops] = useState(null)
  const [idx, setIdx] = useState(0)
  const [fading, setFading] = useState(false)
  const intervalRef = useRef(null)
  const mapReady = useRef(false)

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}data/osm_daily_needs.json`
    fetch(url)
      .then((r) => r.json())
      .then((d) => setAllStops(d.stops))
      .catch(() => setAllStops(null))
  }, [])

  const renderStop = useCallback((stopData) => {
    const map = mapInstance.current
    if (!map || !stopData) return

    if (markersLayer.current) {
      markersLayer.current.clearLayers()
    } else {
      markersLayer.current = L.layerGroup().addTo(map)
    }

    const layer = markersLayer.current
    const { stop, amenities } = stopData

    map.setView([stop.lat, stop.lon], 15, { animate: false })

    L.circleMarker([stop.lat, stop.lon], {
      radius: 7,
      fillColor: '#DA291C',
      color: '#fff',
      weight: 2,
      fillOpacity: 1,
    }).addTo(layer)

    L.circle([stop.lat, stop.lon], {
      radius: stop.radius_m,
      color: '#5c4a3a',
      weight: 1,
      fillColor: '#5c4a3a',
      fillOpacity: 0.06,
      dashArray: '4 4',
    }).addTo(layer)

    amenities.forEach((a) => {
      const meta = CAT_META[a.category]
      if (!meta) return
      L.circleMarker([a.lat, a.lon], {
        radius: 3.5,
        fillColor: meta.color,
        color: meta.color,
        weight: 0.5,
        fillOpacity: 0.75,
      }).addTo(layer)
    })
  }, [])

  // Destroy map when panel hides, create when it shows
  useEffect(() => {
    if (!visible || !mapRef.current || !allStops) {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
        markersLayer.current = null
        mapReady.current = false
      }
      return
    }

    // Delay map creation so the panel has finished its opacity/transform transition
    const timer = setTimeout(() => {
      if (!mapRef.current || mapInstance.current) return

      const first = allStops[idx]
      const map = L.map(mapRef.current, {
        center: [first.stop.lat, first.stop.lon],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      mapInstance.current = map
      mapReady.current = true
      renderStop(first)

      // Extra invalidateSize after tiles load
      setTimeout(() => {
        if (mapInstance.current) mapInstance.current.invalidateSize()
      }, 300)
    }, 550)

    return () => clearTimeout(timer)
  }, [visible, allStops]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rotate every 3 seconds while visible
  useEffect(() => {
    if (!visible || !allStops) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      return
    }

    intervalRef.current = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setIdx((prev) => (prev + 1) % allStops.length)
        setFading(false)
      }, 400)
    }, 3000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [visible, allStops])

  // When idx changes, update the map markers and notify parent
  useEffect(() => {
    if (!allStops) return
    const current = allStops[idx]
    if (mapReady.current) renderStop(current)
    const displayTotal = DISPLAY_ORDER.reduce((sum, cat) => sum + (current.counts[cat] || 0), 0)
    onStopChange?.({ name: current.stop.name, total: displayTotal })
  }, [idx, allStops, renderStop, onStopChange])

  // Reset to first stop when panel hides
  useEffect(() => {
    if (!visible) {
      setIdx(0)
      setFading(false)
    }
  }, [visible])

  const current = allStops?.[idx]
  const displayTotal = current
    ? DISPLAY_ORDER.reduce((sum, cat) => sum + (current.counts[cat] || 0), 0)
    : null

  return (
    <div className={`needs-side-panels ${visible ? 'needs-show' : ''}`} aria-hidden="true">
      <div className="needs-panel needs-panel-left">
        <div className={`needs-fade ${fading ? 'needs-fading' : ''}`}>
          <div className="needs-panel-title">{current?.stop.name || '-'}</div>
          <div className="needs-panel-subtitle">
            {current?.stop.line || ''} · {current?.stop.walk_minutes || 10} min walk
          </div>
        </div>
        <div className="needs-map-container" ref={mapRef} />
        <div className="needs-panel-source">Map data: OpenStreetMap</div>
        <div className="needs-stop-dots">
          {allStops?.map((_, i) => (
            <span key={i} className={`needs-dot ${i === idx ? 'needs-dot-active' : ''}`} />
          ))}
        </div>
      </div>
      <div className="needs-panel needs-panel-right">
        <div className={`needs-fade ${fading ? 'needs-fading' : ''}`}>
          <div className="needs-panel-title">{displayTotal ?? '-'} daily needs</div>
          <div className="needs-panel-subtitle">within a 10-minute walk</div>
          <div className="needs-cat-list">
            {DISPLAY_ORDER.map((cat) => {
              const count = current?.counts?.[cat]
              if (!count) return null
              const meta = CAT_META[cat]
              return (
                <div className="needs-cat-row" key={cat}>
                  <span className="needs-cat-icon">{meta.icon}</span>
                  <span className="needs-cat-label">{meta.label}</span>
                  <span className="needs-cat-count">{count}</span>
                  <span className="needs-cat-dot" style={{ background: meta.color }} />
                </div>
              )
            })}
          </div>
        </div>
        <div className="needs-panel-takeaway">
          Near transit, many everyday errands are reachable without a car.
        </div>
      </div>
    </div>
  )
}
