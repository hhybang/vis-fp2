/**
 * Per-project counterfactual model — the same one the Lever Rack uses, but
 * applied project-by-project so the explorer can recolor housing dots.
 *
 * Two stylized policy levers:
 *   1. FLOOR        — every TOD project reserves >=20% deed-restricted.
 *                     (CA SB 35-style inclusionary floor.)
 *   2. DEEP_TARGET  — at least half of the affordable share is at <=50% AMI.
 *                     (Seattle MHA + LIHTC-stack equivalent.)
 *
 * For each project:
 *   - Top up `affrdUnit` to 20% of `hu` if it is short, pulling from the
 *     market segment.
 *   - Distribute the topped-up units across the four AMI bands in the
 *     project's existing affordable mix proportions (or a default 30/30/25/15
 *     split if the project has no banding info).
 *   - Re-balance bands so deep (<=50% AMI) >= 50% of total affordable.
 *
 * Output: a project-shaped record with the same keys MassBuilds uses, so
 * `getAffordabilityColor` and the rest of the explorer pipeline keep working
 * unchanged.
 */

const FLOOR_SHARE = 0.20
const DEEP_SHARE_OF_AFFORDABLE = 0.5
const DEFAULT_BAND_SPLIT = { u30: 0.30, a3050: 0.30, a5080: 0.25, a80p: 0.15 }

export function applyPolicyPackageToProject(project) {
  const hu = project.hu || 0
  if (hu <= 0) return project

  let u30 = project.affU30 || 0
  let a3050 = project.aff3050 || 0
  let a5080 = project.aff5080 || 0
  let a80p = project.aff80p || 0
  let aff = project.affrdUnit || 0

  const knownAff = u30 + a3050 + a5080 + a80p
  const targetAff = hu * FLOOR_SHARE

  if (aff < targetAff) {
    const need = targetAff - aff
    if (knownAff > 1e-6) {
      u30 += need * (u30 / knownAff)
      a3050 += need * (a3050 / knownAff)
      a5080 += need * (a5080 / knownAff)
      a80p += need * (a80p / knownAff)
    } else {
      u30 += need * DEFAULT_BAND_SPLIT.u30
      a3050 += need * DEFAULT_BAND_SPLIT.a3050
      a5080 += need * DEFAULT_BAND_SPLIT.a5080
      a80p += need * DEFAULT_BAND_SPLIT.a80p
    }
    aff = targetAff
  }

  const totalAff = u30 + a3050 + a5080 + a80p
  const deepCurrent = u30 + a3050
  const deepTarget = totalAff * DEEP_SHARE_OF_AFFORDABLE

  if (deepCurrent < deepTarget) {
    let need = deepTarget - deepCurrent
    const fromA80p = Math.min(a80p, need)
    a80p -= fromA80p
    need -= fromA80p
    const fromA5080 = Math.min(a5080, need)
    a5080 -= fromA5080
    need -= fromA5080
    const moved = (deepTarget - deepCurrent) - need
    u30 += moved * 0.4
    a3050 += moved * 0.6
  }

  return {
    ...project,
    affrdUnit: aff,
    affU30: u30,
    aff3050: a3050,
    aff5080: a5080,
    aff80p: a80p,
  }
}

/* -------------------------------------------------------------------------- */
/*  Counts a renter at a given annual income can compete for in a project.    */
/*  Mirrors the AMI banding used by getAffordabilityColor.                    */
/* -------------------------------------------------------------------------- */

const BOSTON_AMI = 140200

export function unitsAccessibleToIncome(project, annualIncome) {
  if (!project) return 0
  const ratio = annualIncome > 0 ? annualIncome / BOSTON_AMI : 0
  const u30 = project.affU30 || 0
  const a3050 = project.aff3050 || 0
  const a5080 = project.aff5080 || 0
  const a80p = project.aff80p || 0
  const aff = project.affrdUnit || 0
  const hu = project.hu || 0
  const market = Math.max(0, hu - aff)

  if (ratio < 0.3) return u30
  if (ratio < 0.5) return u30 + a3050
  if (ratio < 0.8) return u30 + a3050 + a5080
  return aff + market
}

export function totalUnitsInReach(projects) {
  return projects.reduce((s, p) => s + (p.hu || 0), 0)
}

export function unitsInReachAccessible(projects, annualIncome) {
  return projects.reduce(
    (s, p) => s + unitsAccessibleToIncome(p, annualIncome),
    0
  )
}

// Project-level counts that mirror the map dot semantics. A project counts as
// "accessible" only when at least PROJECT_ACCESSIBLE_SHARE of its units are
// in this renter's AMI tier — same threshold used to paint the brown dots in
// getAffordabilityColor — so the counter on ExplorerIntro stays in sync with
// what the reader sees on the map.
export const PROJECT_ACCESSIBLE_SHARE = 0.20

export function isProjectAccessible(project, annualIncome) {
  const hu = project?.hu || 0
  if (hu <= 0) return false
  return unitsAccessibleToIncome(project, annualIncome) / hu >= PROJECT_ACCESSIBLE_SHARE
}

export function projectsAccessibleInReach(projects, annualIncome) {
  return projects.reduce(
    (s, p) => s + (isProjectAccessible(p, annualIncome) ? 1 : 0),
    0
  )
}
