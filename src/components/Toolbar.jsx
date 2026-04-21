export default function Toolbar({
  travelMode,
  onTravelModeChange,
  affordabilityPct,
  onAffordabilityChange,
  isLoading,
  routeLoading,
  commuteTime,
  mapLayer,
  onMapLayerChange,
  clickedPoint,
  onClearExploration,
  selectedHousing,
  onClearHousingSelection,
}) {
  const busy = isLoading || routeLoading
  const showFooter =
    busy || commuteTime !== null || clickedPoint || selectedHousing

  return (
    <div className="toolbar">
      <div className="toolbar-row toolbar-row-controls">
        <div className="toolbar-group">
          <span className="toolbar-label">Map layer</span>
          <div className="layer-toggle">
            <button
              type="button"
              className={mapLayer === 'transit' ? 'active' : ''}
              onClick={() => onMapLayerChange('transit')}
            >
              Transit stops
            </button>
            <button
              type="button"
              className={mapLayer === 'housing' ? 'active' : ''}
              onClick={() => onMapLayerChange('housing')}
            >
              Housing projects
            </button>
          </div>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-label">Travel mode</span>
          <select
            value={travelMode}
            onChange={(e) => onTravelModeChange(e.target.value)}
            aria-label="Travel mode for reach area and commute"
          >
            <option value="public_transport">Public transit</option>
            <option value="foot-walking">Walking</option>
            <option value="driving-car">Driving</option>
          </select>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="toolbar-group slider-group">
          <span className="toolbar-label">
            Rent budget: <strong>{affordabilityPct}%</strong> of income
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={affordabilityPct}
            onChange={(e) => onAffordabilityChange(Number(e.target.value))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={affordabilityPct}
          />
        </div>
      </div>

      {showFooter && (
        <div className="toolbar-row toolbar-row-footer">
          <div className="toolbar-footer-left">
            {busy && (
              <div className="loading-block" role="status" aria-live="polite">
                <span className="loading-dot" aria-hidden />
                <span>Loading isochrone and commute…</span>
              </div>
            )}
            {!busy && commuteTime !== null && (
              <p className="commute-time">Est. commute: ~{commuteTime} min</p>
            )}
          </div>
          <div className="toolbar-footer-actions">
            {clickedPoint && (
              <button type="button" className="toolbar-link-btn" onClick={onClearExploration}>
                Clear map exploration
              </button>
            )}
            {selectedHousing && (
              <button type="button" className="toolbar-link-btn" onClick={onClearHousingSelection}>
                Clear selected project
              </button>
            )}
          </div>
        </div>
      )}

      {selectedHousing && (
        <div className="toolbar-selected-housing">
          <strong>{selectedHousing.name}</strong>
          <span className="toolbar-selected-meta">
            {selectedHousing.municipal}
            {selectedHousing.nhood ? ` · ${selectedHousing.nhood}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
