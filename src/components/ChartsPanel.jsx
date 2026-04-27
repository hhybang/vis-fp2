import RentHistogram from './charts/RentHistogram'
import IncomeHistogram from './charts/IncomeHistogram'
import ExplorerIntro from './ExplorerIntro'

export default function ChartsPanel({
  filteredTracts,
  rentData,
  isochroneData,
  tractBoundaries,
  monthlyIncome,
  affordabilityPct,
  onAffordabilityChange,
  avgRent,
  filteredHousing = [],
  cfFilteredHousing = [],
  policyPackage = false,
  onPolicyPackageChange,
}) {
  const hasIsochrone = isochroneData && isochroneData.features && isochroneData.features.length > 0

  return (
    <div className="charts-panel">
      <ExplorerIntro
        filteredHousing={filteredHousing}
        cfFilteredHousing={cfFilteredHousing}
        monthlyIncome={monthlyIncome}
        policyPackage={policyPackage}
        onPolicyPackageChange={onPolicyPackageChange}
      />
      <div className="chart-card chart-card-distribution">
        <h3>Rent &amp; Income Distribution in Your Reach</h3>

        <section className="distribution-section">
          <h4 className="distribution-subhead">Monthly rent</h4>
          <div className="rent-budget-slider">
            <p className="rent-budget-slider-hint">
              Set the share of income you&rsquo;d spend on rent. The histogram
              highlights what falls within that budget in your reach area.
              HUD&rsquo;s affordability standard is 30%.
            </p>
            <label htmlFor="rent-budget-pct" className="rent-budget-slider-label">
              Rent budget: <strong>{affordabilityPct}%</strong> of income
            </label>
            <input
              id="rent-budget-pct"
              type="range"
              min="0"
              max="100"
              value={affordabilityPct}
              onChange={(e) => onAffordabilityChange?.(Number(e.target.value))}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={affordabilityPct}
            />
          </div>
          {hasIsochrone ? (
            <RentHistogram
              filteredTracts={filteredTracts}
              rentData={rentData}
              tractBoundaries={tractBoundaries}
              isochroneData={isochroneData}
              monthlyIncome={monthlyIncome}
              affordabilityPct={affordabilityPct}
            />
          ) : (
            <p className="empty-state">Click on the map to see rent data for the area</p>
          )}
        </section>

        <section className="distribution-section">
          <h4 className="distribution-subhead">Household income</h4>
          {hasIsochrone && filteredTracts.length > 0 ? (
            <IncomeHistogram
              filteredTracts={filteredTracts}
              monthlyIncome={monthlyIncome}
            />
          ) : (
            <p className="empty-state">Click on the map to see income data for the area</p>
          )}
        </section>
      </div>
    </div>
  )
}
