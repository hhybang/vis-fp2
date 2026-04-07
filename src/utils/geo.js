import * as turf from '@turf/turf'

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

export function getAffordabilityColor(project, annualIncome) {
  const AMI = 140200
  const ratio = annualIncome / AMI

  // Check if this project has units at or below the user's AMI tier
  let hasAffordableUnits = false
  let hasModerateUnits = false

  if (ratio < 0.3) {
    hasAffordableUnits = project.affU30 > 0
    hasModerateUnits = project.aff3050 > 0
  } else if (ratio < 0.5) {
    hasAffordableUnits = project.affU30 > 0 || project.aff3050 > 0
    hasModerateUnits = project.aff5080 > 0
  } else if (ratio < 0.8) {
    hasAffordableUnits = project.affU30 > 0 || project.aff3050 > 0 || project.aff5080 > 0
    hasModerateUnits = project.aff80p > 0
  } else {
    hasAffordableUnits = project.affrdUnit > 0
    hasModerateUnits = false
  }

  if (hasAffordableUnits) return '#00843D'
  if (hasModerateUnits) return '#ED8B00'
  return '#DA291C'
}
