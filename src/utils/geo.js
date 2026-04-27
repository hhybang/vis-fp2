import * as turf from '@turf/turf'
import { unitsAccessibleToIncome, PROJECT_ACCESSIBLE_SHARE } from './policyPackage'

export function pointInPolygon(lat, lng, geojsonFeature) {
  const pt = turf.point([lng, lat])
  try {
    return turf.booleanPointInPolygon(pt, geojsonFeature)
  } catch {
    return false
  }
}

export function getOuterIsochrone(isochroneData) {
  if (!isochroneData || !isochroneData.features) return null
  // The feature with the largest time value is the outer ring
  const sorted = [...isochroneData.features].sort(
    (a, b) => (b.properties.value || 0) - (a.properties.value || 0)
  )
  return sorted[0] || null
}

export function tractIntersectsIsochrone(tractFeature, isochroneFeature) {
  if (!tractFeature || !isochroneFeature) return false
  try {
    const intersection = turf.intersect(
      turf.featureCollection([tractFeature, isochroneFeature])
    )
    return intersection !== null
  } catch {
    // Fallback: check if tract centroid is within isochrone
    try {
      const centroid = turf.centroid(tractFeature)
      return turf.booleanPointInPolygon(centroid, isochroneFeature)
    } catch {
      return false
    }
  }
}

export function getAffordabilityTier(annualIncome) {
  const AMI = 140200
  const ratio = annualIncome / AMI
  if (ratio < 0.3) return 'u30'
  if (ratio < 0.5) return '30_50'
  if (ratio < 0.8) return '50_80'
  return '80p'
}

export function filterHousingByAffordability(projects, annualIncome) {
  const tier = getAffordabilityTier(annualIncome)
  return projects.filter((p) => {
    switch (tier) {
      case 'u30': return p.affU30 > 0
      case '30_50': return p.affU30 > 0 || p.aff3050 > 0
      case '50_80': return p.affU30 > 0 || p.aff3050 > 0 || p.aff5080 > 0
      case '80p': return p.affrdUnit > 0 || p.hu > 0
      default: return p.hu > 0
    }
  })
}

// Color a project dot by the *share* of its units this renter can actually
// compete for, not by the binary "has any unit at all in the right band."
// The binary version painted every project brown the moment the policy
// package guaranteed >=20% deed-restricted everywhere, since a single
// rounded-up unit was enough to flip the dot. Using a share threshold lets
// the lever's effect on the map mirror the counter's: dots only turn brown
// for projects where the renter gains meaningful access.
const AFFORDABLE_SHARE_THRESHOLD = PROJECT_ACCESSIBLE_SHARE
const MODERATE_SHARE_THRESHOLD = 0.05

export function getAffordabilityColor(project, annualIncome) {
  const hu = project.hu || 0
  if (hu <= 0) return '#d4d0c4'

  const accessible = unitsAccessibleToIncome(project, annualIncome)
  const share = accessible / hu

  // Palette matches the AMI tier colors used throughout the story (MotivationPanels
  // waffle, PolicyGapPanels TIERS): brown for affordable, amber for one tier above,
  // muted paper for above-budget — so a reader carries the same color memory from
  // the narrative into the explorer.
  if (share >= AFFORDABLE_SHARE_THRESHOLD) return '#6b2b27'
  if (share >= MODERATE_SHARE_THRESHOLD) return '#d38e42'
  return '#d4d0c4'
}
