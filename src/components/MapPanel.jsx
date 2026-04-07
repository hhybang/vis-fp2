import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { getAffordabilityColor } from '../utils/geo'

const VEHICLE_COLORS = {
  0: '#2ecc71', // Light rail - green
  1: '#e74c3c', // Heavy rail - red
  2: '#9b59b6', // Commuter rail - purple
  3: '#3498db', // Bus - blue
}

const VEHICLE_LABELS = {
  0: 'Light Rail',
  1: 'Heavy Rail',
  2: 'Commuter Rail',
  3: 'Bus',
}

const ISO_COLORS = [
  { min: 0, max: 600, color: '#e94560', opacity: 0.35, label: '0-10 min' },
  { min: 600, max: 1200, color: '#e94560', opacity: 0.22, label: '10-20 min' },
  { min: 1200, max: 1800, color: '#e94560', opacity: 0.12, label: '20-30 min' },
]

export default function MapPanel({
  mbtaStops,
  isochroneData,
  routeData,
  filteredHousing,
  clickedPoint,
  workLocation,
  monthlyIncome,
  affordabilityPct,
  onMapClick,
  mapLayer,
}) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const stopsLayerRef = useRef(null)
  const isoLayerRef = useRef(null)
  const housingLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const markerRef = useRef(null)
  const workMarkerRef = useRef(null)
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick

  // Initialize map
  useEffect(() => {
    if (mapInstanceRef.current) return

    const center = workLocation ? [workLocation.lat, workLocation.lng] : [42.36, -71.06]
    const map = L.map(mapRef.current, {
      center,
      zoom: 13,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map)

    map.on('click', (e) => {
      onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // MBTA stops
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (stopsLayerRef.current) {
      map.removeLayer(stopsLayerRef.current)
    }

    const layer = L.layerGroup()
    mbtaStops.forEach((stop) => {
      const color = VEHICLE_COLORS[stop.vehicleType] || '#3498db'
      const radius = stop.vehicleType <= 1 ? 4 : stop.vehicleType === 2 ? 3.5 : 2
      L.circleMarker([stop.lat, stop.lng], {
        radius,
        fillColor: color,
        color: color,
        weight: 0.5,
        fillOpacity: 0.7,
      })
        .bindTooltip(`${stop.name} (${VEHICLE_LABELS[stop.vehicleType] || 'Bus'})`, {
          direction: 'top',
          offset: [0, -4],
        })
        .addTo(layer)
    })
    layer.addTo(map)
    stopsLayerRef.current = layer
  }, [mbtaStops])

  // Isochrone overlay
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (isoLayerRef.current) {
      map.removeLayer(isoLayerRef.current)
    }

    if (!isochroneData || !isochroneData.features) return

    const layer = L.layerGroup()
    const sorted = [...isochroneData.features].sort(
      (a, b) => (b.properties.value || 0) - (a.properties.value || 0)
    )

    sorted.forEach((feature) => {
      const seconds = feature.properties.value || 0
      const isoStyle = ISO_COLORS.find((c) => seconds > c.min && seconds <= c.max) || ISO_COLORS[2]
      L.geoJSON(feature, {
        style: {
          fillColor: isoStyle.color,
          fillOpacity: isoStyle.opacity,
          color: isoStyle.color,
          weight: 1.5,
          opacity: 0.6,
        },
      }).addTo(layer)
    })

    layer.addTo(map)
    isoLayerRef.current = layer
  }, [isochroneData])

  // Clicked point marker
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (markerRef.current) {
      map.removeLayer(markerRef.current)
    }

    if (!clickedPoint) return

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;background:#e94560;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })

    markerRef.current = L.marker([clickedPoint.lat, clickedPoint.lng], { icon }).addTo(map)
  }, [clickedPoint])

  // Work location marker
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !workLocation) return

    if (workMarkerRef.current) {
      map.removeLayer(workMarkerRef.current)
    }

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;background:#1a1a2e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    })

    workMarkerRef.current = L.marker([workLocation.lat, workLocation.lng], { icon })
      .bindTooltip('Work', { permanent: true, direction: 'top', offset: [0, -10] })
      .addTo(map)
  }, [workLocation])

  // Housing dots
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (housingLayerRef.current) {
      map.removeLayer(housingLayerRef.current)
    }

    if (!filteredHousing.length) return

    const annualIncome = monthlyIncome * 12
    const layer = L.layerGroup()

    const units = filteredHousing.map((h) => h.hu).filter((u) => u > 0)
    const maxUnits = Math.max(...units, 1)

    filteredHousing.forEach((h) => {
      const color = getAffordabilityColor(h, annualIncome)
      const radius = 2 + Math.sqrt(h.hu / maxUnits) * 6
      L.circleMarker([h.lat, h.lng], {
        radius,
        fillColor: color,
        color: '#fff',
        weight: 0.5,
        fillOpacity: 0.85,
      })
        .bindTooltip(
          `<div class="housing-tooltip">
            <strong>${h.name}</strong>
            Units: ${h.hu} | Affordable: ${h.affrdUnit}<br/>
            ${h.municipal}${h.nhood ? ', ' + h.nhood : ''}<br/>
            Status: ${h.status}
          </div>`,
          { direction: 'top', offset: [0, -8] }
        )
        .addTo(layer)
    })

    layer.addTo(map)
    housingLayerRef.current = layer
  }, [filteredHousing, monthlyIncome])

  // Route polyline
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current)
    }

    if (!routeData || !routeData.features) return

    const layer = L.geoJSON(routeData, {
      style: {
        color: '#1a1a2e',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 6',
      },
    })

    layer.addTo(map)
    routeLayerRef.current = layer
  }, [routeData])

  return (
    <div className="map-container">
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      {!clickedPoint && (
        <div className="map-instruction">Click anywhere on the map to explore commute times</div>
      )}
      <div className="map-legend">
        {mapLayer === 'transit' && (
          <>
            <h4>Transit Stops</h4>
            {Object.entries(VEHICLE_LABELS).map(([type, label]) => (
              <div className="legend-item" key={type}>
                <div className="legend-dot" style={{ background: VEHICLE_COLORS[type] }} />
                <span>{label}</span>
              </div>
            ))}
          </>
        )}
        {mapLayer === 'housing' && (
          <>
            <h4>Housing Affordability</h4>
            <p className="legend-explainer">
              Based on your income relative to Boston Area Median Income (AMI: $140,200).
              Colors show whether a project has units designated for your income tier.
            </p>
            <div className="legend-item" title="This project has units designated for your AMI tier or below — you are likely eligible.">
              <div className="legend-dot" style={{ background: '#00843D' }} />
              <span>Affordable</span>
            </div>
            <div className="legend-item" title="This project has units one AMI tier above yours — you may qualify depending on availability.">
              <div className="legend-dot" style={{ background: '#ED8B00' }} />
              <span>Moderate</span>
            </div>
            <div className="legend-item" title="This project has no units at or near your AMI tier — unlikely to be affordable for your income.">
              <div className="legend-dot" style={{ background: '#DA291C' }} />
              <span>Above Budget</span>
            </div>
          </>
        )}
        {isochroneData && (
          <>
            <h4 style={{ marginTop: 10 }}>Isochrone</h4>
            {ISO_COLORS.map((c) => (
              <div className="legend-item" key={c.label}>
                <div
                  className="legend-dot"
                  style={{ background: c.color, opacity: c.opacity + 0.3 }}
                />
                <span>{c.label}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
