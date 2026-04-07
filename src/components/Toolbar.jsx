export default function Toolbar({
  travelMode,
  onTravelModeChange,
  affordabilityPct,
  onAffordabilityChange,
  isLoading,
  commuteTime,
  mapLayer,
  onMapLayerChange,
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="toolbar-group">
          <span className="toolbar-label">Map Layer</span>
          <div className="layer-toggle">
            <button
              className={mapLayer === 'transit' ? 'active' : ''}
              onClick={() => onMapLayerChange('transit')}
            >
              Transit Stops
            </button>
            <button
              className={mapLayer === 'housing' ? 'active' : ''}
              onClick={() => onMapLayerChange('housing')}
            >
              Housing Projects
            </button>
          </div>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-label">Travel Mode</span>
          <select value={travelMode} onChange={(e) => onTravelModeChange(e.target.value)}>
            <option value="public_transport">Public Transit</option>
            <option value="foot-walking">Walking</option>
            <option value="driving-car">Driving</option>
          </select>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="toolbar-group slider-group">
          <span className="toolbar-label">
            Rent Budget: <strong>{affordabilityPct}%</strong> of income
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={affordabilityPct}
            onChange={(e) => onAffordabilityChange(Number(e.target.value))}
          />
        </div>

        {isLoading && <span className="loading">Loading isochrone...</span>}

        {commuteTime !== null && (
          <span className="commute-time">
            Est. commute: ~{commuteTime} min
          </span>
        )}
      </div>
    </div>
  )
}
