import { projectsAccessibleInReach } from '../utils/policyPackage'
// Reuse the story's lever rack styles (.lever, .lever-svg, .lever-arm, .lever-on)
// so the explorer's policy-package toggle uses the same visual vocabulary.
import './scrolly.css'

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
  // Counts mirror the map dot semantics: a project counts as accessible only
  // when at least 20% of its units are in this renter's AMI tier (the same
  // threshold getAffordabilityColor uses to paint the brown dots).
  const totalProjects = filteredHousing.length
  const todayAccessible = projectsAccessibleInReach(filteredHousing, annualIncome)
  const cfAccessible = projectsAccessibleInReach(cfFilteredHousing, annualIncome)
  const delta = Math.max(0, cfAccessible - todayAccessible)
  const todayPct = totalProjects > 0 ? (todayAccessible / totalProjects) * 100 : 0
  const cfPct = totalProjects > 0 ? (cfAccessible / totalProjects) * 100 : 0

  return (
    <div className="chart-card explorer-intro">
      <div className="explorer-intro-eyebrow">From the story to your block</div>
      <h3 className="explorer-intro-title">
        See the policy package on a map you control.
      </h3>

      <div
        className={`cf-impact-card${policyPackage ? ' is-cf' : ''}`}
        aria-live="polite"
      >
        {hasReach ? (
          <>
            <div className="cf-impact-eyebrow">
              In your reach area
            </div>
            <div className="cf-impact-row">
              <div className={`cf-impact-side${!policyPackage ? ' is-active' : ''}`}>
                <div className="cf-impact-side-label">Today</div>
                <div className="cf-impact-side-num">
                  {todayAccessible.toLocaleString()}
                </div>
                <div className="cf-impact-side-sub">
                  affordable projects for you ({todayPct.toFixed(1)}%)
                </div>
              </div>
              {/* Same animated SVG lever the story uses, scaled down. Acts as
                  the primary affordance for toggling the policy package on/off. */}
              <button
                type="button"
                className={`lever cf-impact-lever ${policyPackage ? 'lever-on' : ''}`}
                aria-pressed={policyPackage}
                aria-label={`Policy package: ${policyPackage ? 'pulled' : 'up'} — click to ${policyPackage ? 'switch back to today' : 'pull both levers'}`}
                onClick={() => onPolicyPackageChange?.(!policyPackage)}
              >
                <span className="lever-pullme" aria-hidden="true">
                  pull me <span className="lever-pullme-arrow">&darr;</span>
                </span>
                <svg viewBox="0 0 80 80" className="lever-svg" aria-hidden="true">
                  <line x1="4" y1="74" x2="40" y2="74" stroke="#3d4732" strokeWidth="1.25" strokeLinecap="round" />
                  <polygon points="8,74 36,74 32,64 12,64" fill="#3d4732" />
                  <circle cx="22" cy="64" r="3.25" fill="#1a1a1a" />
                  <g transform="translate(22 64)">
                    <g className="lever-arm">
                      <line x1="0" y1="0" x2="0" y2="-42" stroke="#5a5346" strokeWidth="5" strokeLinecap="round" className="lever-arm-shaft" />
                      <circle cx="0" cy="-42" r="6.5" fill="#fffaee" stroke="#3d4732" strokeWidth="2" className="lever-arm-knob" />
                      <circle cx="0" cy="-42" r="2" fill="#3d4732" className="lever-arm-knob-dot" />
                    </g>
                  </g>
                </svg>
              </button>
              <div className={`cf-impact-side${policyPackage ? ' is-active' : ''}`}>
                <div className="cf-impact-side-label">Both levers pulled</div>
                <div className="cf-impact-side-num">
                  {cfAccessible.toLocaleString()}
                </div>
                <div className="cf-impact-side-sub">
                  affordable projects for you ({cfPct.toFixed(1)}%)
                </div>
              </div>
            </div>
            <div className="cf-impact-foot">
              {annualIncome > 0 ? (
                delta > 0 ? (
                  <>
                    The policy package opens roughly{' '}
                    <strong>+{delta.toLocaleString()} affordable projects</strong>{' '}
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
            and, how many would be under the policy package.
          </div>
        )}
      </div>
    </div>
  )
}
