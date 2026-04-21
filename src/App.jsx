import { useState, useEffect, useCallback } from 'react'
import ScrollyStory from './components/ScrollyStory'
import OnboardingModal from './components/OnboardingModal'
import MapPanel from './components/MapPanel'
import ChartsPanel from './components/ChartsPanel'
import Toolbar from './components/Toolbar'
import { loadMBTAStops, loadMassBuilds, loadACSIncomeData } from './utils/dataLoaders'
import { fetchIsochrone, fetchDirections, fetchCensusRentData, fetchTractBoundaries } from './utils/api'
import { getOuterIsochrone, pointInPolygon, tractIntersectsIsochrone } from './utils/geo'
import './App.css'

function App() {
  const [storyComplete, setStoryComplete] = useState(false)
  const [onboarded, setOnboarded] = useState(false)
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [workLocation, setWorkLocation] = useState(null)
  const [workAddress, setWorkAddress] = useState('')

  const [mbtaStops, setMbtaStops] = useState([])
  const [massBuilds, setMassBuilds] = useState([])
  const [acsData, setAcsData] = useState([])
  const [rentData, setRentData] = useState([])
  const [tractBoundaries, setTractBoundaries] = useState(null)

  const [mapLayer, setMapLayer] = useState('housing') // 'transit' or 'housing'
  const [travelMode, setTravelMode] = useState('public_transport')
  const [clickedPoint, setClickedPoint] = useState(null)
  const [isochroneData, setIsochroneData] = useState(null)
  const [routeData, setRouteData] = useState(null)
  const [affordabilityPct, setAffordabilityPct] = useState(30)
  const [isLoading, setIsLoading] = useState(false)
  const [routeLoading, setRouteLoading] = useState(false)
  const [commuteTime, setCommuteTime] = useState(null)
  const [selectedHousing, setSelectedHousing] = useState(null)

  const [filteredTracts, setFilteredTracts] = useState([])
  const [filteredHousing, setFilteredHousing] = useState([])
  const [avgRent, setAvgRent] = useState(0)
  const [editProfileOpen, setEditProfileOpen] = useState(false)

  useEffect(() => {
    if (!onboarded) return
    Promise.all([
      loadMBTAStops(),
      loadMassBuilds(),
      loadACSIncomeData(),
      fetchCensusRentData().catch(() => []),
      fetchTractBoundaries().catch(() => null),
    ]).then(([stops, builds, acs, rent, tracts]) => {
      setMbtaStops(stops)
      setMassBuilds(builds)
      setAcsData(acs)
      setRentData(rent)
      setTractBoundaries(tracts)
    })
  }, [onboarded])

  useEffect(() => {
    if (!clickedPoint) return
    setIsLoading(true)
    setIsochroneData(null)
    setRouteData(null)
    setCommuteTime(null)
    fetchIsochrone(clickedPoint.lat, clickedPoint.lng, travelMode)
      .then(setIsochroneData)
      .catch((err) => console.error('Isochrone error:', err))
      .finally(() => setIsLoading(false))
  }, [clickedPoint, travelMode])

  useEffect(() => {
    if (!clickedPoint || !workLocation) return
    setRouteLoading(true)
    setRouteData(null)
    setCommuteTime(null)
    const profile = travelMode === 'driving-car' ? 'driving-car' : 'foot-walking'
    fetchDirections(clickedPoint.lat, clickedPoint.lng, workLocation.lat, workLocation.lng, profile)
      .then((data) => {
        setRouteData(data)
        if (data.features && data.features[0]) {
          const mins = Math.round(data.features[0].properties.summary.duration / 60)
          setCommuteTime(mins)
        }
      })
      .catch((err) => console.error('Route error:', err))
      .finally(() => setRouteLoading(false))
  }, [clickedPoint, workLocation, travelMode])

  useEffect(() => {
    if (!isochroneData) {
      setFilteredHousing([])
      setFilteredTracts([])
      setAvgRent(0)
      return
    }
    const outerIso = getOuterIsochrone(isochroneData)
    if (!outerIso) return

    const housing = massBuilds.filter((h) => pointInPolygon(h.lat, h.lng, outerIso))
    setFilteredHousing(housing)

    // Find tract IDs that intersect the isochrone using local GeoJSON boundaries
    const intersectingIds = (tractBoundaries?.features || [])
      .filter((tf) => tractIntersectsIsochrone(tf, outerIso))
      .map((tf) => tf.properties.GEOID)

    const matched = acsData.filter((d) => intersectingIds.includes(d.tractId))
    setFilteredTracts(matched)

    // Compute avg rent from Census DP04 data for matching tracts
    const tractIdSet = new Set(intersectingIds)
    const matchedRent = rentData.filter((r) => {
      const geoId = r.GEO_ID
        ? r.GEO_ID.replace('1400000US', '')
        : `25${r.state}${r.county}${r.tract}`
      return tractIdSet.has(geoId)
    })
    const rents = matchedRent.map((r) => parseInt(r.DP04_0134E)).filter((v) => v > 0)
    setAvgRent(rents.length > 0 ? rents.reduce((a, b) => a + b, 0) / rents.length : 2300)
  }, [isochroneData, massBuilds, acsData, rentData, tractBoundaries])

  const handleOnboard = useCallback((income, location, address) => {
    setMonthlyIncome(income)
    setWorkLocation(location)
    setWorkAddress(address)
    setOnboarded(true)
  }, [])

  const handleProfileSave = useCallback((income, location, address) => {
    setMonthlyIncome(income)
    setWorkLocation(location)
    setWorkAddress(address)
    setEditProfileOpen(false)
  }, [])

  const handleMapClick = useCallback((pt) => {
    setSelectedHousing(null)
    setClickedPoint(pt)
  }, [])

  const handleHousingClick = useCallback((h) => {
    setSelectedHousing((prev) => (prev?.id === h.id ? null : h))
  }, [])

  const handleClearExploration = useCallback(() => {
    setClickedPoint(null)
    setIsochroneData(null)
    setRouteData(null)
    setCommuteTime(null)
  }, [])

  const handleClearHousingSelection = useCallback(() => {
    setSelectedHousing(null)
  }, [])

  useEffect(() => {
    if (!storyComplete) return
    const id = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [storyComplete])

  if (!storyComplete) {
    return (
      <ScrollyStory
        onComplete={() => {
          setStoryComplete(true)
        }}
      />
    )
  }

  if (!onboarded) {
    return (
      <OnboardingModal
        onSubmit={handleOnboard}
        onBackToStory={() => setStoryComplete(false)}
      />
    )
  }

  return (
    <div className="app">
      {editProfileOpen && workLocation && (
        <OnboardingModal
          variant="edit"
          initialProfile={{
            monthlyIncome,
            workAddress,
            workLocation,
          }}
          onSubmit={handleProfileSave}
          onCancel={() => setEditProfileOpen(false)}
        />
      )}
      <header className="app-header">
        <div className="app-header-title-row">
          <h1>Boston Housing Affordability & Commute Explorer</h1>
          <button
            type="button"
            className="app-header-back"
            onClick={() => setStoryComplete(false)}
          >
            Back to story
          </button>
        </div>
        <button
          type="button"
          className="header-info"
          onClick={() => setEditProfileOpen(true)}
          aria-label="Edit income and workplace"
        >
          <span>Income: ${monthlyIncome.toLocaleString()}/mo</span>
          <span>Work: {workAddress || 'Not set'}</span>
        </button>
      </header>
      <div className="panels">
        <div className="panel-left">
          <MapPanel
            mbtaStops={mapLayer === 'transit' ? mbtaStops : []}
            isochroneData={isochroneData}
            routeData={routeData}
            filteredHousing={mapLayer === 'housing' ? massBuilds : []}
            clickedPoint={clickedPoint}
            workLocation={workLocation}
            monthlyIncome={monthlyIncome}
            affordabilityPct={affordabilityPct}
            onMapClick={handleMapClick}
            onHousingClick={handleHousingClick}
            selectedHousingId={selectedHousing?.id ?? null}
            mapBusy={isLoading || routeLoading}
            mapLayer={mapLayer}
          />
        </div>
        <div className="panel-right">
          <div className="panel-right-toolbar-wrap">
            <Toolbar
              travelMode={travelMode}
              onTravelModeChange={setTravelMode}
              affordabilityPct={affordabilityPct}
              onAffordabilityChange={setAffordabilityPct}
              isLoading={isLoading}
              routeLoading={routeLoading}
              commuteTime={commuteTime}
              mapLayer={mapLayer}
              onMapLayerChange={setMapLayer}
              clickedPoint={clickedPoint}
              onClearExploration={handleClearExploration}
              selectedHousing={selectedHousing}
              onClearHousingSelection={handleClearHousingSelection}
            />
          </div>
          <div className="charts-panel-scroll">
            <ChartsPanel
              filteredTracts={filteredTracts}
              rentData={rentData}
              isochroneData={isochroneData}
              tractBoundaries={tractBoundaries}
              monthlyIncome={monthlyIncome}
              affordabilityPct={affordabilityPct}
              avgRent={avgRent}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
