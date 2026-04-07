import { useState, useEffect, useRef } from 'react'
import { autocompleteAddress, geocodeAddress } from '../utils/api'

export default function OnboardingModal({ onSubmit }) {
  const [income, setIncome] = useState('')
  const [address, setAddress] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    const monthlyIncome = parseFloat(income)
    if (!monthlyIncome || monthlyIncome <= 0) {
      setError('Please enter a valid income')
      return
    }
    if (!address.trim()) {
      setError('Please enter a work address')
      return
    }

    if (selectedLocation) {
      onSubmit(monthlyIncome, selectedLocation, address)
      return
    }

    setLoading(true)
    setError('')
    try {
      const location = await geocodeAddress(address + ', Boston, MA')
      onSubmit(monthlyIncome, location, address)
    } catch {
      setError('Could not find that address. Try adding more detail (e.g., city, state).')
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <h2>Welcome</h2>
        <p>Tell us about yourself to explore housing options in Greater Boston.</p>

        <div className="form-group">
          <label htmlFor="income">Monthly Gross Income ($)</label>
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

        <div className="form-group" ref={wrapperRef}>
          <label htmlFor="address">Work Address</label>
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

        {error && <p style={{ color: '#e94560', fontSize: 13, marginBottom: 16 }}>{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Finding your workplace...' : 'Start Exploring'}
        </button>
      </form>
    </div>
  )
}
