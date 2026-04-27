import { unitsInReachAccessible, totalUnitsInReach } from '../utils/policyPackage'

/**
 * Bridges the story's policy argument into the dashboard. Recaps the lever
 * package, hosts the "Today vs. with both levers" toggle, and surfaces a
 * live counter of homes priced for the reader inside their reach area.
 */
export default function ExplorerIntro({
  filteredHousing = [],
  cfFilteredHousing = [],
  monthlyIncome = 0,
  policyPackage = false,
  onPolicyPackageChange,
}) {
  const annualIncome = monthlyIncome * 12
  const hasReach = filteredHousing.length > 0
  const totalUnits = totalUnitsInReach(filteredHousing)
  const todayAccessible = unitsInReachAccessible(filteredHousing, annualIncome)
  const cfAccessible = unitsInReachAccessible(cfFilteredHousing, annualIncome)
  const delta = Math.max(0, cfAccessible - todayAccessible)
  const todayPct = totalUnits > 0 ? (todayAccessible / totalUnits) * 100 : 0
  const cfPct = totalUnits > 0 ? (cfAccessible / totalUnits) * 100 : 0

  return (
    <div className="chart-card explorer-intro">
      <div className="explorer-intro-eyebrow">From the story to your block</div>
      <h3 className="explorer-intro-title">
        See the policy package on a map you control.
      </h3>
      <p className="explorer-intro-lead">
        The story closed on a counterfactual: <strong>20% deed-restricted on
        every TOD project, half at &le;50% AMI</strong>. Below, that same
        package is wired into the explorer. Set a home-search point on the
        map; toggle <em>Today</em> vs <em>both levers pulled</em>; watch the
        housing dots and the count of homes priced for you change.
      </p>

      <div
        className={`cf-impact-card${policyPackage ? ' is-cf' : ''}`}
        aria-live="polite"
      >
        {hasReach ? (
          <>
            <div className="cf-impact-eyebrow">
              In your reach area &middot; {Math.round(totalUnits).toLocaleString()} homes total
            </div>
            <div className="cf-impact-row">
              <div className={`cf-impact-side${!policyPackage ? ' is-active' : ''}`}>
                <div className="cf-impact-side-label">Today</div>
                <div className="cf-impact-side-num">
                  {Math.round(todayAccessible).toLocaleString()}
                </div>
                <div className="cf-impact-side-sub">
                  homes priced for you ({todayPct.toFixed(1)}%)
                </div>
              </div>
              <div className="cf-impact-arrow" aria-hidden="true">&rarr;</div>
              <div className={`cf-impact-side${policyPackage ? ' is-active' : ''}`}>
                <div className="cf-impact-side-label">Both levers pulled</div>
                <div className="cf-impact-side-num">
                  {Math.round(cfAccessible).toLocaleString()}
                </div>
                <div className="cf-impact-side-sub">
                  homes priced for you ({cfPct.toFixed(1)}%)
                </div>
              </div>
            </div>
            <div className="cf-impact-foot">
              {annualIncome > 0 ? (
                delta > 0 ? (
                  <>
                    The policy package opens roughly{' '}
                    <strong>+{Math.round(delta).toLocaleString()} homes</strong>{' '}
                    in your reach to a renter at your income.{' '}
                    <button
                      type="button"
                      className="cf-impact-link"
                      onClick={() => onPolicyPackageChange?.(!policyPackage)}
                    >
                      {policyPackage ? 'Switch back to today' : 'Show that on the map'}
                    </button>
                  </>
                ) : (
                  <>
                    Your income tier already has access to most of the pipeline,
                    so the package shifts who else can compete more than it
                    shifts your number. The story&rsquo;s argument is about the
                    households below 80% AMI &mdash; toggle the map to see how
                    much more of the pipeline opens for them.
                  </>
                )
              ) : (
                <>Set your monthly income in your profile to see how many of these are priced for you.</>
              )}
            </div>
          </>
        ) : (
          <div className="cf-impact-empty">
            Click anywhere on the map to set a reach area. The counter will
            show how many of the homes in that area are priced for you today
            &mdash; and how many would be under the policy package.
          </div>
        )}
      </div>

      <ul className="explorer-takeaways">
        <li>
          <strong>Map click</strong>: sets a home-search location and draws the
          time-based reach area. Charts and the counter above filter to what&rsquo;s
          inside it.
        </li>
        <li>
          <strong>Housing dots</strong>: green = a project has units in your
          income tier or below. Red = above your reach. Toggle the package to
          see how many flip.
        </li>
        <li>
          <strong>Why the toggle matters</strong>: today&rsquo;s map is what
          MA&rsquo;s current law produces. The counterfactual is what the same
          pipeline would produce if MA paired its TOD zoning with the floor
          and the in-lieu fund.
        </li>
      </ul>
    </div>
  )
}
