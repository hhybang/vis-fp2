export default function Toolbar({
  travelMode,
  onTravelModeChange,
  affordabilityPct,
  onAffordabilityChange,
  isLoading,
  commuteTime,
}) {
  return (
    <div className="toolbar">
      <label>
        Travel Mode:
        <select value={travelMode} onChange={(e) => onTravelModeChange(e.target.value)}>
          <option value="public_transport">Public Transit</option>
          <option value="foot-walking">Walking</option>
          <option value="driving-car">Driving</option>
        </select>
      </label>

      <div className="slider-group">
        <label>
          Affordability: {affordabilityPct}% of income
          <input
            type="range"
            min="0"
            max="100"
            value={affordabilityPct}
            onChange={(e) => onAffordabilityChange(Number(e.target.value))}
          />
        </label>
      </div>

      {isLoading && <span className="loading">Loading isochrone...</span>}

      {commuteTime !== null && (
        <span className="commute-time">
          Est. commute: ~{commuteTime} min
        </span>
      )}
    </div>
  )
}
