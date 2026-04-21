import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export default function RentHistogram({
  filteredTracts,
  rentData,
  monthlyIncome,
  affordabilityPct,
}) {
  const svgRef = useRef()
  const summaryRef = useRef()

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (summaryRef.current) summaryRef.current.innerHTML = ''

    const filteredTractIds = new Set(filteredTracts.map((t) => t.tractId))

    let values = []
    if (rentData.length > 0 && filteredTractIds.size > 0) {
      values = rentData
        .filter((r) => {
          const geoId = r.GEO_ID
            ? r.GEO_ID.replace('1400000US', '')
            : `25${r.state}${r.county}${r.tract}`
          return filteredTractIds.has(geoId)
        })
        .map((r) => parseInt(r.DP04_0134E))
        .filter((v) => v > 0 && v < 10000)
    }

    if (values.length === 0 && filteredTracts.length > 0) {
      values = filteredTracts
        .map((t) => Math.round((t.medianIncome * 0.3) / 12))
        .filter((v) => v > 0)
    }

    if (values.length === 0) return

    // Stats
    const sorted = [...values].sort((a, b) => a - b)
    const median = d3.median(sorted)
    const mean = d3.mean(sorted)
    const yourBudget = monthlyIncome * (affordabilityPct / 100)
    const percentile = (sorted.filter((v) => v <= yourBudget).length / sorted.length) * 100
    const diff = yourBudget - median

    // Chart dimensions
    const margin = { top: 30, right: 20, bottom: 50, left: 50 }
    const width = 400 - margin.left - margin.right
    const height = 220 - margin.top - margin.bottom

    const g = svg
      .attr('viewBox', '0 0 400 220')
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear()
      .domain([d3.min(values) * 0.8, d3.max(values) * 1.1])
      .range([0, width])

    const bins = d3.bin().domain(x.domain()).thresholds(15)(values)
    const y = d3.scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length)])
      .nice()
      .range([height, 0])

    // Color bars: highlight which bins are within your budget
    g.selectAll('rect.bar')
      .data(bins)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.x0) + 1)
      .attr('width', (d) => Math.max(0, x(d.x1) - x(d.x0) - 2))
      .attr('y', (d) => y(d.length))
      .attr('height', (d) => height - y(d.length))
      .attr('fill', (d) => (d.x1 <= yourBudget ? '#00843D' : d.x0 < yourBudget ? '#ED8B00' : '#DA291C'))
      .attr('rx', 2)
      .attr('opacity', 0.85)

    // Median line
    if (median >= x.domain()[0] && median <= x.domain()[1]) {
      g.append('line')
        .attr('x1', x(median)).attr('x2', x(median))
        .attr('y1', -8).attr('y2', height)
        .attr('stroke', '#9B6A8C').attr('stroke-width', 2)
      g.append('text')
        .attr('x', x(median)).attr('y', -12)
        .attr('text-anchor', 'middle').attr('fill', '#9B6A8C')
        .attr('font-size', 10).attr('font-weight', 600)
        .text(`Median $${Math.round(median).toLocaleString()}`)
    }

    // Your budget line
    if (yourBudget > 0 && yourBudget >= x.domain()[0] && yourBudget <= x.domain()[1]) {
      g.append('line')
        .attr('x1', x(yourBudget)).attr('x2', x(yourBudget))
        .attr('y1', -8).attr('y2', height)
        .attr('stroke', '#5B7FA5').attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '6,3')

      const labelX = x(yourBudget)
      const nudge = labelX > width * 0.7 ? -4 : 4
      const anchor = labelX > width * 0.7 ? 'end' : 'start'
      const labelText = `You: $${Math.round(yourBudget).toLocaleString()}`
      g.append('text')
        .attr('x', labelX + nudge).attr('y', height - 6)
        .attr('text-anchor', anchor)
        .attr('font-size', 10).attr('font-weight', 600)
        .attr('stroke', '#fff').attr('stroke-width', 3.5)
        .attr('stroke-linejoin', 'round')
        .attr('fill', 'none')
        .text(labelText)
      g.append('text')
        .attr('x', labelX + nudge).attr('y', height - 6)
        .attr('text-anchor', anchor).attr('fill', '#5B7FA5')
        .attr('font-size', 10).attr('font-weight', 600)
        .text(labelText)
    }

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `$${d.toLocaleString()}`))
      .selectAll('text').attr('font-size', 9)

    g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text').attr('font-size', 9)

    g.append('text')
      .attr('x', width / 2).attr('y', height + 38)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#666')
      .text('Median Rent by Census Tract ($)')

    g.append('text')
      .attr('transform', 'rotate(-90)').attr('y', -38).attr('x', -height / 2)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#666')
      .text('Tracts')

    // Summary callout
    if (summaryRef.current) {
      const absDiff = Math.abs(Math.round(diff))
      const direction = diff >= 0 ? 'above' : 'below'
      const emoji = diff >= 0 ? (diff > median * 0.2 ? 'comfortable' : 'tight but feasible') : 'over-budget for most units'
      summaryRef.current.innerHTML = `
        <div class="chart-summary">
          <div class="summary-stats">
            <div class="stat">
              <span class="stat-value" style="color:#5B7FA5">$${Math.round(yourBudget).toLocaleString()}</span>
              <span class="stat-label">Your budget (${affordabilityPct}%)</span>
            </div>
            <div class="stat">
              <span class="stat-value" style="color:#9B6A8C">$${Math.round(median).toLocaleString()}</span>
              <span class="stat-label">Area median rent</span>
            </div>
            <div class="stat">
              <span class="stat-value">${Math.round(percentile)}%</span>
              <span class="stat-label">of tracts you can afford</span>
            </div>
          </div>
          <p class="summary-insight">
            Your rent budget is <strong>$${absDiff.toLocaleString()} ${direction}</strong> the area median: ${emoji}.
            <span style="color:#00843D">Green bars</span> = tracts within your budget.
          </p>
        </div>
      `
    }
  }, [filteredTracts, rentData, monthlyIncome, affordabilityPct])

  return (
    <div>
      <svg ref={svgRef} className="chart-svg" />
      <div ref={summaryRef} />
    </div>
  )
}
