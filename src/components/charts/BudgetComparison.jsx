import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const CAR_COST = 1000
const MBTA_PASS = 90

export default function BudgetComparison({ monthlyIncome, avgRent }) {
  const svgRef = useRef()

  useEffect(() => {
    if (!svgRef.current || !monthlyIncome) return

    const rent = Math.round(avgRent || 2300)
    const drivingRemaining = Math.max(0, monthlyIncome - rent - CAR_COST)
    const transitRemaining = Math.max(0, monthlyIncome - rent - MBTA_PASS)

    const scenarios = [
      {
        label: 'Driving',
        segments: [
          { name: 'Rent', value: rent, color: '#e74c3c' },
          { name: 'Car', value: CAR_COST, color: '#e67e22' },
          { name: 'Remaining', value: drivingRemaining, color: '#2ecc71' },
        ],
      },
      {
        label: 'Transit',
        segments: [
          { name: 'Rent', value: rent, color: '#e74c3c' },
          { name: 'MBTA Pass', value: MBTA_PASS, color: '#e67e22' },
          { name: 'Remaining', value: transitRemaining, color: '#2ecc71' },
        ],
      },
    ]

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 30, right: 20, bottom: 40, left: 70 }
    const width = 400 - margin.left - margin.right
    const height = 200 - margin.top - margin.bottom

    const g = svg
      .attr('viewBox', '0 0 400 200')
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const y = d3.scaleBand()
      .domain(scenarios.map((s) => s.label))
      .range([0, height])
      .padding(0.35)

    const x = d3.scaleLinear()
      .domain([0, monthlyIncome])
      .range([0, width])

    scenarios.forEach((scenario) => {
      let cumulative = 0
      scenario.segments.forEach((seg) => {
        const pct = seg.value / monthlyIncome
        const segWidth = x(seg.value)

        g.append('rect')
          .attr('x', x(cumulative))
          .attr('y', y(scenario.label))
          .attr('width', segWidth)
          .attr('height', y.bandwidth())
          .attr('fill', seg.color)
          .attr('rx', 3)

        if (pct > 0.08) {
          g.append('text')
            .attr('x', x(cumulative) + segWidth / 2)
            .attr('y', y(scenario.label) + y.bandwidth() / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', 10)
            .attr('font-weight', 600)
            .text(`${seg.name} ${(pct * 100).toFixed(0)}%`)
        }

        cumulative += seg.value
      })
    })

    g.append('g')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .attr('font-size', 11)
      .attr('font-weight', 600)

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => `$${(d / 1000).toFixed(0)}k`))
      .selectAll('text')
      .attr('font-size', 9)

    // Legend
    const legendData = [
      { name: 'Rent', color: '#e74c3c' },
      { name: 'Transport', color: '#e67e22' },
      { name: 'Remaining', color: '#2ecc71' },
    ]

    const legend = g.append('g').attr('transform', `translate(0, -18)`)
    legendData.forEach((d, i) => {
      legend.append('rect')
        .attr('x', i * 90)
        .attr('y', 0)
        .attr('width', 10)
        .attr('height', 10)
        .attr('fill', d.color)
        .attr('rx', 2)
      legend.append('text')
        .attr('x', i * 90 + 14)
        .attr('y', 9)
        .attr('font-size', 10)
        .attr('fill', '#666')
        .text(d.name)
    })

    // Summary text
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + 32)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .text(`Avg rent: $${rent.toLocaleString()} | Car: $${CAR_COST}/mo | MBTA: $${MBTA_PASS}/mo`)
  }, [monthlyIncome, avgRent])

  return <svg ref={svgRef} className="chart-svg" />
}
