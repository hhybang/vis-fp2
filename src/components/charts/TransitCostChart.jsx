import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const CAR_BREAKDOWN = [
  { name: 'Car Payment', value: 400, color: '#8b4a4a' },
  { name: 'Insurance', value: 150, color: '#a06050' },
  { name: 'Gas', value: 200, color: '#b07a60' },
  { name: 'Maintenance', value: 100, color: '#c09478' },
  { name: 'Parking', value: 150, color: '#d0ae90' },
]

const MBTA_COST = { name: 'MBTA Pass', value: 90, color: '#4a6282' }

export default function TransitCostChart() {
  const svgRef = useRef()

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const carTotal = CAR_BREAKDOWN.reduce((s, d) => s + d.value, 0)
    const annualSavings = (carTotal - MBTA_COST.value) * 12

    const margin = { top: 48, right: 24, bottom: 44, left: 80 }
    const width = 520 - margin.left - margin.right
    const height = 210 - margin.top - margin.bottom

    const g = svg
      .attr('viewBox', '0 0 520 210')
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, carTotal * 1.05]).range([0, width])

    const y = d3.scaleBand()
      .domain(['Driving', 'Transit'])
      .range([0, height])
      .padding(0.4)

    // Car bar: stacked segments
    let cx = 0
    CAR_BREAKDOWN.forEach((seg) => {
      g.append('rect')
        .attr('x', x(cx))
        .attr('y', y('Driving'))
        .attr('width', x(seg.value))
        .attr('height', y.bandwidth())
        .attr('fill', seg.color)

      if (seg.value / carTotal > 0.1) {
        g.append('text')
          .attr('x', x(cx) + x(seg.value) / 2)
          .attr('y', y('Driving') + y.bandwidth() / 2)
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .attr('fill', '#fff')
          .attr('font-size', 9)
          .attr('font-weight', 600)
          .text(seg.name)
      }
      cx += seg.value
    })

    // Car total label
    g.append('text')
      .attr('x', x(carTotal) + 6)
      .attr('y', y('Driving') + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#1a1a1a')
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .text(`$${carTotal.toLocaleString()}/mo`)

    // Transit bar
    g.append('rect')
      .attr('x', 0)
      .attr('y', y('Transit'))
      .attr('width', x(MBTA_COST.value))
      .attr('height', y.bandwidth())
      .attr('fill', MBTA_COST.color)

    g.append('text')
      .attr('x', x(MBTA_COST.value) / 2)
      .attr('y', y('Transit') + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', 9)
      .attr('font-weight', 600)
      .text('MBTA Pass')

    // Transit total label
    g.append('text')
      .attr('x', x(MBTA_COST.value) + 6)
      .attr('y', y('Transit') + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#1a1a1a')
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .text(`$${MBTA_COST.value}/mo`)

    // Savings bracket
    const bracketX = x(MBTA_COST.value) + 2
    const bracketEndX = x(carTotal) - 2
    const bracketY = y('Transit') + y.bandwidth() + 18

    g.append('line')
      .attr('x1', bracketX).attr('x2', bracketX)
      .attr('y1', bracketY - 6).attr('y2', bracketY)
      .attr('stroke', '#1a1a1a').attr('stroke-width', 1.5)

    g.append('line')
      .attr('x1', bracketX).attr('x2', bracketEndX)
      .attr('y1', bracketY).attr('y2', bracketY)
      .attr('stroke', '#1a1a1a').attr('stroke-width', 1.5)

    g.append('line')
      .attr('x1', bracketEndX).attr('x2', bracketEndX)
      .attr('y1', bracketY - 6).attr('y2', bracketY)
      .attr('stroke', '#1a1a1a').attr('stroke-width', 1.5)

    g.append('text')
      .attr('x', (bracketX + bracketEndX) / 2)
      .attr('y', bracketY + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', '#1a1a1a')
      .attr('font-size', 12)
      .attr('font-weight', 700)
      .attr('font-family', 'var(--font-label)')
      .text(`You save $${annualSavings.toLocaleString()}/year`)

    // Y axis labels
    g.append('g')
      .call(d3.axisLeft(y).tickSize(0))
      .call((g) => g.select('.domain').remove())
      .selectAll('text')
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .attr('font-family', 'var(--font-label)')
      .attr('fill', '#1a1a1a')

    // Title
    svg.append('text')
      .attr('x', margin.left)
      .attr('y', 24)
      .attr('font-size', 14)
      .attr('font-weight', 700)
      .attr('font-family', 'var(--font-label)')
      .attr('fill', '#1a1a1a')
      .text('Monthly Transportation Costs')

    // Legend
    const legend = g.append('g').attr('transform', `translate(0, -28)`)
    let lx = 0
    CAR_BREAKDOWN.forEach((d) => {
      legend.append('rect')
        .attr('x', lx).attr('y', 0)
        .attr('width', 8).attr('height', 8)
        .attr('fill', d.color)
      legend.append('text')
        .attr('x', lx + 11).attr('y', 7)
        .attr('font-size', 9).attr('fill', '#595959')
        .text(`${d.name} $${d.value}`)
      lx += d.name.length * 5.5 + 40
    })
  }, [])

  return <svg ref={svgRef} className="chart-svg" />
}
