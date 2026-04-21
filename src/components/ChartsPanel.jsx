import RentHistogram from './charts/RentHistogram'
import IncomeHistogram from './charts/IncomeHistogram'
import BudgetComparison from './charts/BudgetComparison'
import ExplorerIntro from './ExplorerIntro'

export default function ChartsPanel({
  filteredTracts,
  rentData,
  isochroneData,
  tractBoundaries,
  monthlyIncome,
  affordabilityPct,
  avgRent,
}) {
  const hasIsochrone = isochroneData && isochroneData.features && isochroneData.features.length > 0

  return (
    <div className="charts-panel">
      <ExplorerIntro />
      <div className="chart-card chart-card-rent">
        <h3>Monthly Rent Distribution</h3>
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
      </div>

      <div className="chart-card chart-card-budget">
        <h3>Monthly Budget: Driving vs. Transit</h3>
        {hasIsochrone ? (
          <BudgetComparison
            monthlyIncome={monthlyIncome}
            affordabilityPct={affordabilityPct}
          />
        ) : (
          <p className="empty-state">Click on the map to compare commute costs</p>
        )}
      </div>

      <div className="chart-card chart-card-income">
        <h3>Household Income Distribution</h3>
        {hasIsochrone && filteredTracts.length > 0 ? (
          <IncomeHistogram
            filteredTracts={filteredTracts}
            monthlyIncome={monthlyIncome}
          />
        ) : (
          <p className="empty-state">Click on the map to see income data for the area</p>
        )}
      </div>
    </div>
  )
}
