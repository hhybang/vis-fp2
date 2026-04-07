import Papa from 'papaparse'

async function loadCSV(url) {
  const fullUrl = import.meta.env.BASE_URL + url.replace(/^\//, '')
  const res = await fetch(fullUrl)
  const text = await res.text()
  // Remove BOM if present (handles both UTF-8 and UTF-16 BOM)
  const clean = text.replace(/^\uFEFF/, '')
  return new Promise((resolve) => {
    Papa.parse(clean, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
    })
  })
}

const BOSTON_BOUNDS = {
  minLat: 42.2,
  maxLat: 42.5,
  minLng: -71.2,
  maxLng: -70.95,
}

export async function loadMBTAStops() {
  const data = await loadCSV('/data/MBTA_GTFS/stops.txt')
  return data
    .filter((d) => d.location_type === '0' || d.location_type === '')
    .filter((d) => {
      const lat = parseFloat(d.stop_lat)
      const lng = parseFloat(d.stop_lon)
      return (
        lat >= BOSTON_BOUNDS.minLat &&
        lat <= BOSTON_BOUNDS.maxLat &&
        lng >= BOSTON_BOUNDS.minLng &&
        lng <= BOSTON_BOUNDS.maxLng
      )
    })
    .map((d) => ({
      id: d.stop_id,
      name: d.stop_name,
      lat: parseFloat(d.stop_lat),
      lng: parseFloat(d.stop_lon),
      vehicleType: parseInt(d.vehicle_type) || 3,
      municipality: d.municipality,
    }))
}

export async function loadMassBuilds() {
  const data = await loadCSV('/data/massbuilds-20260315.csv')
  return data
    .filter((d) => {
      const status = (d.status || '').toLowerCase()
      return status === 'completed' || status === 'under_construction'
    })
    .filter((d) => {
      const lat = parseFloat(d.latitude)
      const lng = parseFloat(d.longitude)
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
    })
    .map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      lat: parseFloat(d.latitude),
      lng: parseFloat(d.longitude),
      hu: parseInt(d.hu) || 0,
      affrdUnit: parseInt(d.affrd_unit) || 0,
      affU30: parseInt(d.aff_u30) || 0,
      aff3050: parseInt(d.aff_30_50) || 0,
      aff5080: parseInt(d.aff_50_80) || 0,
      aff80p: parseInt(d.aff_80p) || 0,
      municipal: d.municipal,
      nhood: d.nhood,
      nTransit: d.n_transit,
    }))
}

export async function loadACSIncomeData() {
  const data = await loadCSV('/data/ACSDP5Y2023-2/ACSDP5Y2023.DP03-Data.csv')
  // Skip the first row which contains column labels
  const rows = data.filter((d) => d.GEO_ID && d.GEO_ID.startsWith('1400000US25'))
  return rows.map((d) => {
    const geoId = d.GEO_ID.replace('1400000US', '')
    return {
      geoId,
      tractId: geoId,
      name: d.NAME,
      totalHouseholds: parseInt(d.DP03_0051E) || 0,
      incomeBrackets: {
        under10k: parseInt(d.DP03_0052E) || 0,
        '10k_15k': parseInt(d.DP03_0053E) || 0,
        '15k_25k': parseInt(d.DP03_0054E) || 0,
        '25k_35k': parseInt(d.DP03_0055E) || 0,
        '35k_50k': parseInt(d.DP03_0056E) || 0,
        '50k_75k': parseInt(d.DP03_0057E) || 0,
        '75k_100k': parseInt(d.DP03_0058E) || 0,
        '100k_150k': parseInt(d.DP03_0059E) || 0,
        '150k_200k': parseInt(d.DP03_0060E) || 0,
        over200k: parseInt(d.DP03_0061E) || 0,
      },
      medianIncome: parseInt(d.DP03_0062E) || 0,
      meanIncome: parseInt(d.DP03_0063E) || 0,
    }
  })
}
