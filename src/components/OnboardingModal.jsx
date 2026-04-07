import { useState } from 'react'
import { geocodeAddress } from '../utils/api'

export default function OnboardingModal({ onSubmit }) {
  const [income, setIncome] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

        <div className="form-group">
          <label htmlFor="address">Work Address</label>
          <input
            id="address"
            type="text"
            placeholder="e.g. 100 Cambridge St, Boston"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        {error && <p style={{ color: '#e94560', fontSize: 13, marginBottom: 16 }}>{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Finding your workplace...' : 'Start Exploring'}
        </button>
      </form>
    </div>
  )
}
