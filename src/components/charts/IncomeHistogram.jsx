import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const BRACKETS = [
  { key: 'under10k', label: '<$10k', lo: 0, hi: 10000 },
  { key: '10k_15k', label: '$10-15k', lo: 10000, hi: 15000 },
  { key: '15k_25k', label: '$15-25k', lo: 15000, hi: 25000 },
  { key: '25k_35k', label: '$25-35k', lo: 25000, hi: 35000 },
  { key: '35k_50k', label: '$35-50k', lo: 35000, hi: 50000 },
  { key: '50k_75k', label: '$50-75k', lo: 50000, hi: 75000 },
  { key: '75k_100k', label: '$75-100k', lo: 75000, hi: 100000 },
  { key: '100k_150k', label: '$100-150k', lo: 100000, hi: 150000 },
  { key: '150k_200k', label: '$150-200k', lo: 150000, hi: 200000 },
  { key: 'over200k', label: '$200k+', lo: 200000, hi: 300000 },
]

export default function IncomeHistogram({ filteredTracts, monthlyIncome }) {
  const svgRef = useRef()
  const summaryRef = useRef()

  useEffect(() => {
    if (!svgRef.current || !filteredTracts.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (summaryRef.current) summaryRef.current.innerHTML = ''

    const annualIncome = monthlyIncome * 12

    // Aggregate counts
    const aggregated = BRACKETS.map((b) => ({
      ...b,
      count: filteredTracts.reduce((sum, t) => sum + (t.incomeBrackets[b.key] || 0), 0),
    }))
    const totalHouseholds = aggregated.reduce((s, d) => s + d.count, 0)

    // Compute weighted median from bracketed data
    let cumulative = 0
    let medianBracket = aggregated[aggregated.length - 1]
    for (const b of aggregated) {
      cumulative += b.count
      if (cumulative >= totalHouseholds / 2) {
        medianBracket = b
        break
      }
    }
    const estMedian = (medianBracket.lo + medianBracket.hi) / 2

    // Find user's bracket and percentile
    let householdsBelow = 0
    let userBracketIdx = aggregated.length - 1
    for (let i = 0; i < aggregated.length; i++) {
      if (annualIncome < aggregated[i].hi) {
        userBracketIdx = i
        // Interpolate within the bracket
        const bracketFraction = (annualIncome - aggregated[i].lo) / (aggregated[i].hi - aggregated[i].lo)
        householdsBelow += aggregated[i].count * bracketFraction
        break
      }
      householdsBelow += aggregated[i].count
    }
    const percentile = totalHouseholds > 0 ? (householdsBelow / totalHouseholds) * 100 : 50

    // Chart
    const margin = { top: 30, right: 20, bottom: 60, left: 55 }
    const width = 400 - margin.left - margin.right
    const height = 240 - margin.top - margin.bottom

    const g = svg
      .attr('viewBox', '0 0 400 240')
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleBand()
      .domain(aggregated.map((d) => d.label))
      .range([0, width])
      .padding(0.12)

    const y = d3.scaleLinear()
      .domain([0, d3.max(aggregated, (d) => d.count)])
      .nice()
      .range([height, 0])

    // Bars: color by relationship to user
    g.selectAll('rect.bar')
      .data(aggregated)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.label))
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(d.count))
      .attr('height', (d) => height - y(d.count))
      .attr('fill', (d, i) => {
        if (i === userBracketIdx) return '#5B7FA5'
        if (i < userBracketIdx) return '#a0d2db'
        return '#dfe6e9'
      })
      .attr('opacity', (d, i) => i === userBracketIdx ? 1 : 0.75)
      .attr('rx', 2)

    // Median bracket indicator
    const medianIdx = aggregated.findIndex((d) => d === medianBracket)
    if (medianIdx >= 0) {
      const mx = x(medianBracket.label) + x.bandwidth() / 2
      g.append('line')
        .attr('x1', mx).attr('x2', mx)
        .attr('y1', -8).attr('y2', height)
        .attr('stroke', '#9B6A8C').attr('stroke-width', 2)
      g.append('text')
        .attr('x', mx).attr('y', -12)
        .attr('text-anchor', 'middle').attr('fill', '#9B6A8C')
        .attr('font-size', 10).attr('font-weight', 600)
        .text(`Median ~$${(estMedian / 1000).toFixed(0)}k`)
    }

    // Your income marker (arrow + line at interpolated position within bracket)
    const userBracketLabel = aggregated[userBracketIdx].label
    const bracketLo = aggregated[userBracketIdx].lo
    const bracketHi = aggregated[userBracketIdx].hi
    const fraction = Math.min(1, Math.max(0, (annualIncome - bracketLo) / (bracketHi - bracketLo)))
    const ux = x(userBracketLabel) + x.bandwidth() * fraction

    g.append('line')
      .attr('x1', ux).attr('x2', ux)
      .attr('y1', -8).attr('y2', height)
      .attr('stroke', '#5B7FA5').attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '6,3')

    // Label with smart positioning and white halo for readability
    const labelNudge = ux > width * 0.7 ? -4 : 4
    const labelAnchor = ux > width * 0.7 ? 'end' : 'start'
    const labelText = `You: $${(annualIncome / 1000).toFixed(0)}k`
    // White outline for contrast against any bar color
    g.append('text')
      .attr('x', ux + labelNudge).attr('y', height - 6)
      .attr('text-anchor', labelAnchor)
      .attr('font-size', 10).attr('font-weight', 600)
      .attr('stroke', '#fff').attr('stroke-width', 3.5)
      .attr('stroke-linejoin', 'round')
      .attr('fill', 'none')
      .text(labelText)
    g.append('text')
      .attr('x', ux + labelNudge).attr('y', height - 6)
      .attr('text-anchor', labelAnchor).attr('fill', '#5B7FA5')
      .attr('font-size', 10).attr('font-weight', 600)
      .text(labelText)

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('font-size', 8)
      .attr('transform', 'rotate(-35)')
      .attr('text-anchor', 'end')

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(',')))
      .selectAll('text').attr('font-size', 9)

    g.append('text')
      .attr('x', width / 2).attr('y', height + 50)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#666')
      .text('Annual Household Income')

    g.append('text')
      .attr('transform', 'rotate(-90)').attr('y', -42).attr('x', -height / 2)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#666')
      .text('Households')

    // Summary callout
    if (summaryRef.current) {
      const diff = annualIncome - estMedian
      const absDiff = Math.abs(Math.round(diff / 1000))
      const direction = diff >= 0 ? 'above' : 'below'
      const pctRound = Math.round(percentile)

      let context = ''
      if (pctRound >= 70) context = 'You earn more than most households in this area.'
      else if (pctRound >= 40) context = 'You\'re near the middle of this area\'s income range.'
      else if (pctRound >= 15) context = 'Many households here earn more, which may mean higher local costs.'
      else context = 'Most households here earn significantly more.'

      summaryRef.current.innerHTML = `
        <div class="chart-summary">
          <div class="summary-stats">
            <div class="stat">
              <span class="stat-value" style="color:#5B7FA5">$${(annualIncome / 1000).toFixed(0)}k</span>
              <span class="stat-label">Your income</span>
            </div>
            <div class="stat">
              <span class="stat-value" style="color:#9B6A8C">~$${(estMedian / 1000).toFixed(0)}k</span>
              <span class="stat-label">Area median</span>
            </div>
            <div class="stat">
              <span class="stat-value">${pctRound}<sup>th</sup></span>
              <span class="stat-label">percentile</span>
            </div>
          </div>
          <p class="summary-insight">
            You're <strong>~$${absDiff}k ${direction}</strong> the area median.
            ${context}
            <span style="color:#5B7FA5">Dark blue bar</span> = your bracket, <span style="color:#a0d2db">light blue</span> = below you.
          </p>
        </div>
      `
    }
  }, [filteredTracts, monthlyIncome])

  return (
    <div>
      <svg ref={svgRef} className="chart-svg" />
      <div ref={summaryRef} />
    </div>
  )
}
