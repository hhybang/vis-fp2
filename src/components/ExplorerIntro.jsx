/**
 * Context and takeaways for the explorer (addresses rubric: narrative + write-up gaps).
 */
export default function ExplorerIntro() {
  return (
    <div className="chart-card explorer-intro">
      <h3>What this tool is for</h3>
      <p>
        This is an <strong>exploratory view</strong> for renters: pick where you might live on the map,
        see reachable areas within about 10–30 minutes from that spot (by your chosen travel mode), and
        compare nearby housing projects and tract-level rent and income context. Your workplace (set in
        the step before) anchors the <strong>commute route</strong> and time estimate.
      </p>
      <ul className="explorer-takeaways">
        <li>
          <strong>Map click</strong>: sets a &ldquo;home search&rdquo; location and draws the time-based
          reach area (isochrone). Charts filter to tracts and projects in that area.
        </li>
        <li>
          <strong>Housing dots</strong>: color reflects affordability vs your budget (AMI tiers). Click a
          dot to pin a project; click again or click the map to clear.
        </li>
        <li>
          <strong>Takeaway</strong>: the story section explains policy and equity; this panel lets you
          test how transit access and rent pressure might feel for a specific commute and budget.
        </li>
      </ul>
    </div>
  )
}
