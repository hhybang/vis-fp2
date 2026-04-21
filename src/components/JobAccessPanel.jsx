import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'

const DESTINATIONS = [
  {
    name: 'Financial District',
    station: 'Downtown Crossing',
    walk: '2 min walk',
    jobs: '~90,000',
    color: '#DA291C',
    lat: 42.3555,
    lon: -71.0601,
  },
  {
    name: 'Kendall Square',
    station: 'Kendall/MIT',
    walk: '3 min walk',
    jobs: '~50,000',
    color: '#DA291C',
    lat: 42.3629,
    lon: -71.0862,
  },
  {
    name: 'Back Bay',
    station: 'Back Bay',
    walk: '1 min walk',
    jobs: '~60,000',
    color: '#ED8B00',
    lat: 42.3474,
    lon: -71.0757,
  },
  {
    name: 'Longwood Medical',
    station: 'Longwood Medical Area',
    walk: '4 min walk',
    jobs: '~45,000',
    color: '#00843D',
    lat: 42.3395,
    lon: -71.1100,
  },
]

export default function JobAccessPanel({ visible }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const mapReady = useRef(false)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    if (!visible || !mapRef.current) {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
        mapReady.current = false
      }
      setAnimate(false)
      return
    }

    const timer = setTimeout(() => {
      if (!mapRef.current || mapInstance.current) return

      const map = L.map(mapRef.current, {
        center: [42.3500, -71.0830],
        zoom: 11.5,
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

      const LABEL_ANCHORS = [
        [80, 4],
        [-10, 4],
        [-10, -12],
        [-10, 4],
      ]

      DESTINATIONS.forEach((d, i) => {
        L.circleMarker([d.lat, d.lon], {
          radius: 8,
          fillColor: d.color,
          color: '#fff',
          weight: 1.5,
          fillOpacity: 0.9,
        }).addTo(map)

        const icon = L.divIcon({
          className: 'jobs-map-label',
          html: `<span style="color:${d.color}">${d.name}</span>`,
          iconSize: [0, 0],
          iconAnchor: LABEL_ANCHORS[i],
        })
        L.marker([d.lat, d.lon], { icon, interactive: false }).addTo(map)
      })

      mapInstance.current = map
      mapReady.current = true

      setTimeout(() => {
        if (mapInstance.current) mapInstance.current.invalidateSize()
      }, 300)

      setAnimate(true)
    }, 550)

    return () => clearTimeout(timer)
  }, [visible])

  return (
    <div className={`jobs-side-panels ${visible ? 'jobs-show' : ''}`} aria-hidden="true">
      <div className="jobs-panel jobs-panel-left">
        <div className="jobs-panel-title">Major Job Centers</div>
        <div className="jobs-panel-subtitle">Greater Boston</div>
        <div className="jobs-map-container" ref={mapRef} />
        <div className="jobs-panel-source">Map data: OpenStreetMap</div>
      </div>

      <div className="jobs-panel jobs-panel-right">
        <div className="jobs-panel-title">Steps from the T</div>
        <div className="jobs-panel-subtitle">station to workplace</div>
        <div className="jobs-dest-list">
          {DESTINATIONS.map((d, i) => (
            <div
              key={i}
              className={`jobs-dest-row ${animate ? 'jobs-row-visible' : ''}`}
              style={{ transitionDelay: `${0.3 + i * 0.12}s` }}
            >
              <span className="jobs-dest-dot" style={{ background: d.color }} />
              <div className="jobs-dest-info">
                <div className="jobs-dest-name">{d.name}</div>
                <div className="jobs-dest-meta">{d.station} · {d.walk}</div>
              </div>
              <div className="jobs-dest-jobs">{d.jobs}</div>
            </div>
          ))}
        </div>
        <div className="jobs-panel-stat">
          <span className="jobs-stat-number">&gt;245k</span> jobs near T stops
        </div>
        <div className="jobs-panel-takeaway">
          Major employment hubs sit within minutes of a transit station.
        </div>
      </div>
    </div>
  )
}
