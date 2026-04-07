import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const CAR_COST = 1000
const MBTA_PASS = 90

export default function BudgetComparison({ monthlyIncome, affordabilityPct }) {
  const svgRef = useRef()

  useEffect(() => {
    if (!svgRef.current || !monthlyIncome) return

    const rent = Math.round(monthlyIncome * (affordabilityPct / 100))

    const drivingTotal = rent + CAR_COST
    const transitTotal = rent + MBTA_PASS
    const maxTotal = Math.max(drivingTotal, transitTotal, monthlyIncome)

    const scenarios = [
      { label: 'Driving', transportName: 'Car', transportCost: CAR_COST, total: drivingTotal },
      { label: 'Transit', transportName: 'MBTA Pass', transportCost: MBTA_PASS, total: transitTotal },
    ]

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Add defs for stripe pattern
    const defs = svg.append('defs')
    defs.append('pattern')
      .attr('id', 'stripe-pattern')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(45)')
      .append('rect')
      .attr('width', 2.5)
      .attr('height', 6)
      .attr('fill', '#5A8A8A')
      .attr('opacity', 0.5)

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
      .domain([0, maxTotal])
      .range([0, width])

    scenarios.forEach((scenario) => {
      const overBudget = scenario.total > monthlyIncome
      const transportWithin = overBudget
        ? Math.max(0, monthlyIncome - rent)
        : scenario.transportCost
      const transportOver = overBudget
        ? scenario.transportCost - transportWithin
        : 0
      const remaining = overBudget
        ? 0
        : monthlyIncome - rent - scenario.transportCost

      // Rent segment
      g.append('rect')
        .attr('x', 0)
        .attr('y', y(scenario.label))
        .attr('width', x(rent))
        .attr('height', y.bandwidth())
        .attr('fill', '#5B7FA5')
        .attr('rx', 3)

      if (rent / maxTotal > 0.08) {
        g.append('text')
          .attr('x', x(rent) / 2)
          .attr('y', y(scenario.label) + y.bandwidth() / 2)
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .attr('fill', '#fff')
          .attr('font-size', 10)
          .attr('font-weight', 600)
          .text(`Rent ${((rent / monthlyIncome) * 100).toFixed(0)}%`)
      }

      // Transport segment (within budget)
      if (transportWithin > 0) {
        g.append('rect')
          .attr('x', x(rent))
          .attr('y', y(scenario.label))
          .attr('width', x(transportWithin))
          .attr('height', y.bandwidth())
          .attr('fill', '#5A8A8A')
          .attr('rx', 3)

        if (transportWithin / maxTotal > 0.08) {
          g.append('text')
            .attr('x', x(rent) + x(transportWithin) / 2)
            .attr('y', y(scenario.label) + y.bandwidth() / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', 10)
            .attr('font-weight', 600)
            .text(`${scenario.transportName} ${((scenario.transportCost / monthlyIncome) * 100).toFixed(0)}%`)
        }
      }

      // Transport segment (over budget - striped)
      if (transportOver > 0) {
        const overX = x(rent + transportWithin)
        const overWidth = x(transportOver)

        // Background
        g.append('rect')
          .attr('x', overX)
          .attr('y', y(scenario.label))
          .attr('width', overWidth)
          .attr('height', y.bandwidth())
          .attr('fill', 'url(#stripe-pattern)')
          .attr('stroke', '#5A8A8A')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4,3')
          .attr('rx', 3)
      }

      // Remaining segment
      if (remaining > 0) {
        g.append('rect')
          .attr('x', x(rent + scenario.transportCost))
          .attr('y', y(scenario.label))
          .attr('width', x(remaining))
          .attr('height', y.bandwidth())
          .attr('fill', '#C4B078')
          .attr('rx', 3)

        if (remaining / maxTotal > 0.08) {
          g.append('text')
            .attr('x', x(rent + scenario.transportCost) + x(remaining) / 2)
            .attr('y', y(scenario.label) + y.bandwidth() / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', 10)
            .attr('font-weight', 600)
            .text(`Remaining ${((remaining / monthlyIncome) * 100).toFixed(0)}%`)
        }
      }

      // Income boundary line
      if (overBudget) {
        g.append('line')
          .attr('x1', x(monthlyIncome))
          .attr('x2', x(monthlyIncome))
          .attr('y1', y(scenario.label) - 4)
          .attr('y2', y(scenario.label) + y.bandwidth() + 4)
          .attr('stroke', '#1a1a2e')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4,3')
      }
    })

    g.append('g')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .attr('font-size', 11)
      .attr('font-weight', 600)

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => `$${(d / 1000).toFixed(1)}k`))
      .selectAll('text')
      .attr('font-size', 9)

    // Legend
    const legendData = [
      { name: 'Rent', color: '#5B7FA5' },
      { name: 'Transport', color: '#5A8A8A' },
      { name: 'Remaining', color: '#C4B078' },
      { name: 'Over budget', color: null, striped: true },
    ]

    const legend = g.append('g').attr('transform', `translate(0, -18)`)
    let lx = 0
    legendData.forEach((d) => {
      if (d.striped) {
        legend.append('rect')
          .attr('x', lx)
          .attr('y', 0)
          .attr('width', 10)
          .attr('height', 10)
          .attr('fill', 'url(#stripe-pattern)')
          .attr('stroke', '#5A8A8A')
          .attr('stroke-width', 0.5)
          .attr('rx', 2)
      } else {
        legend.append('rect')
          .attr('x', lx)
          .attr('y', 0)
          .attr('width', 10)
          .attr('height', 10)
          .attr('fill', d.color)
          .attr('rx', 2)
      }
      legend.append('text')
        .attr('x', lx + 14)
        .attr('y', 9)
        .attr('font-size', 10)
        .attr('fill', '#666')
        .text(d.name)
      lx += d.name.length * 6.5 + 24
    })

    // Summary text
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + 32)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .text(`Rent budget: $${rent.toLocaleString()} (${affordabilityPct}% of income) | Car: $${CAR_COST}/mo | MBTA: $${MBTA_PASS}/mo`)
  }, [monthlyIncome, affordabilityPct])

  return <svg ref={svgRef} className="chart-svg" />
}
