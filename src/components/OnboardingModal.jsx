import { useState, useEffect, useRef } from 'react'
import { autocompleteAddress, geocodeAddress, reverseGeocodeLabel } from '../utils/api'
import WorkLocationMiniMap from './WorkLocationMiniMap'

const RENT_TO_INCOME_RATIO = 0.3

export default function OnboardingModal({
  onSubmit,
  onBackToStory,
  variant = 'welcome',
  initialProfile,
  onCancel,
}) {
  const isEdit = variant === 'edit'

  const [budgetMode, setBudgetMode] = useState('income')
  const [income, setIncome] = useState(() =>
    isEdit && initialProfile ? String(Math.round(initialProfile.monthlyIncome)) : ''
  )
  const [rentBudget, setRentBudget] = useState('')
  const [address, setAddress] = useState(() =>
    isEdit && initialProfile ? initialProfile.workAddress || '' : ''
  )
  const [selectedLocation, setSelectedLocation] = useState(() =>
    isEdit && initialProfile ? initialProfile.workLocation : null
  )
  const [locationMode, setLocationMode] = useState('search')
  const [mapLocation, setMapLocation] = useState(() =>
    isEdit && initialProfile ? initialProfile.workLocation : null
  )
  const [mapLabel, setMapLabel] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!mapLocation) {
      setMapLabel('')
      return
    }
    let cancelled = false
    reverseGeocodeLabel(mapLocation.lat, mapLocation.lng).then((label) => {
      if (!cancelled && label) setMapLabel(label)
    })
    return () => {
      cancelled = true
    }
  }, [mapLocation])

  const handleAddressChange = (e) => {
    const value = e.target.value
    setAddress(value)
    setSelectedLocation(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 3) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await autocompleteAddress(value)
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
      } catch {
        setSuggestions([])
        setShowSuggestions(false)
      }
    }, 300)
  }

  const handleSuggestionClick = (suggestion) => {
    setAddress(suggestion.label)
    setSelectedLocation({ lat: suggestion.lat, lng: suggestion.lng })
    setSuggestions([])
    setShowSuggestions(false)
  }

  const handleMapPickChange = ({ lat, lng }) => {
    setMapLocation({ lat, lng })
    setSelectedLocation({ lat, lng })
    setAddress('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    let monthlyIncome = 0
    if (budgetMode === 'income') {
      monthlyIncome = parseFloat(income)
      if (!monthlyIncome || monthlyIncome <= 0) {
        setError('Please enter a valid monthly gross income, or switch to rent budget.')
        return
      }
    } else {
      const rent = parseFloat(rentBudget)
      if (!rent || rent <= 0) {
        setError('Please enter a maximum monthly rent, or switch to income.')
        return
      }
      monthlyIncome = rent / RENT_TO_INCOME_RATIO
    }

    if (locationMode === 'map') {
      if (!mapLocation) {
        setError('Click the map to set your workplace, or use address search instead.')
        return
      }
      const label =
        mapLabel ||
        `Work (${mapLocation.lat.toFixed(4)}, ${mapLocation.lng.toFixed(4)})`
      onSubmit(monthlyIncome, mapLocation, label)
      return
    }

    if (!address.trim() && !selectedLocation) {
      setError('Enter a work address or switch to choosing a location on the map.')
      return
    }

    if (selectedLocation) {
      onSubmit(monthlyIncome, selectedLocation, address || mapLabel)
      return
    }

    setLoading(true)
    try {
      const location = await geocodeAddress(address + ', Boston, MA')
      onSubmit(monthlyIncome, location, address)
    } catch {
      setError('Could not find that address. Try adding more detail (e.g., city, state).')
      setLoading(false)
    }
  }

  const submitLabel = isEdit ? 'Save' : 'Start exploring'
  const loadingSubmitLabel = isEdit ? 'Saving…' : 'Finding your workplace…'

  return (
    <div className="modal-overlay">
      <form className="modal modal-wide" onSubmit={handleSubmit}>
        <h2>{isEdit ? 'Update income & workplace' : 'Welcome'}</h2>
        <p className="modal-lead">
          {isEdit
            ? 'Change your budget or workplace. Commute times and affordability colors update after you save.'
            : 'Set up a quick profile so we can color housing by affordability and estimate commute times. All processing happens in your browser; use whichever options you are comfortable with.'}
        </p>

        <fieldset className="modal-fieldset">
          <legend className="modal-legend">Budget</legend>
          <div className="form-group">
            <label htmlFor="budgetMode">How should we set your budget?</label>
            <select
              id="budgetMode"
              className="modal-select"
              value={budgetMode}
              onChange={(e) => setBudgetMode(e.target.value)}
              aria-label="Budget input type"
            >
              <option value="income">Monthly gross income</option>
              <option value="rent">Max monthly rent (housing budget)</option>
            </select>
          </div>
          {budgetMode === 'income' ? (
            <div className="form-group">
              <label htmlFor="income">Monthly gross income ($)</label>
              <input
                id="income"
                type="number"
                placeholder="e.g. 5000"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                min="0"
                step="100"
              />
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="rentBudget">Max monthly rent ($)</label>
              <input
                id="rentBudget"
                type="number"
                placeholder="e.g. 1800"
                value={rentBudget}
                onChange={(e) => setRentBudget(e.target.value)}
                min="0"
                step="50"
              />
              <p className="form-hint">
                We translate this into an implied income using a standard 30% rent-to-income rule for
                affordability tier colors (you can still adjust the rent slider in the explorer).
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="modal-fieldset">
          <legend className="modal-legend">Workplace</legend>
          <div className="form-group">
            <label htmlFor="locationMode">How should we set your workplace?</label>
            <select
              id="locationMode"
              className="modal-select"
              value={locationMode}
              onChange={(e) => setLocationMode(e.target.value)}
              aria-label="Workplace input type"
            >
              <option value="search">Search by address</option>
              <option value="map">Choose on map</option>
            </select>
          </div>

          {locationMode === 'search' ? (
            <div className="form-group" ref={wrapperRef}>
              <label htmlFor="address">Work address</label>
              <div className="autocomplete-wrapper">
                <input
                  id="address"
                  type="text"
                  placeholder="e.g. 100 Cambridge St, Boston"
                  value={address}
                  onChange={handleAddressChange}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  autoComplete="off"
                />
                {showSuggestions && (
                  <ul className="autocomplete-list">
                    {suggestions.map((s, i) => (
                      <li key={i} onMouseDown={() => handleSuggestionClick(s)}>
                        {s.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <WorkLocationMiniMap location={mapLocation} onLocationChange={handleMapPickChange} />
          )}
        </fieldset>

        {locationMode === 'map' && mapLocation && mapLabel && (
          <p className="map-address-preview">
            <strong>Detected:</strong> {mapLabel}
          </p>
        )}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          {isEdit && onCancel && (
            <button type="button" className="modal-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="modal-btn-primary" disabled={loading}>
            {loading ? loadingSubmitLabel : submitLabel}
          </button>
        </div>

        {!isEdit && onBackToStory && (
          <p className="modal-back-story">
            <button type="button" className="modal-back-story-btn" onClick={onBackToStory}>
              ← Back to story
            </button>
          </p>
        )}
      </form>
    </div>
  )
}
