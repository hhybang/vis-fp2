import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { loadMassBuilds } from '../utils/dataLoaders'
import { GLOSSARY, KEY_GLOSSARY_TERMS } from '../utils/glossary'

/* =========================================================================
   Inline jargon tooltips + glossary strip
   Housing-policy copy is full of domain terms. Readers get a dotted underline
   on each jargon word, a hover/focus definition popup, and a persistent key-
   terms strip at the top of the section for baseline context.
   ========================================================================= */

function Jargon({ term, children }) {
  const entry = GLOSSARY[term]
  if (!entry) return <span>{children ?? term}</span>
  return (
    <span className="jargon-term" tabIndex={0} aria-describedby={`glossary-${term}`}>
      {children ?? term}
      <span className="jargon-tooltip" role="tooltip" id={`glossary-${term}`}>
        <span className="jargon-tooltip-label">{entry.short}</span>
        <span className="jargon-tooltip-def">{entry.def}</span>
      </span>
    </span>
  )
}

function GlossaryStrip() {
  const [open, setOpen] = useState(false)
  return (
    <section className={`policy-glossary ${open ? 'is-open' : ''}`} aria-label="Key terms">
      <button
        type="button"
        className="policy-glossary-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="policy-glossary-eyebrow">Key terms</span>
        <span className="policy-glossary-hint">
          {open ? 'Hide definitions' : 'Show definitions for housing-policy jargon'}
        </span>
        <span className="policy-glossary-chev" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <dl className="policy-glossary-list">
          {KEY_GLOSSARY_TERMS.map((key) => {
            const entry = GLOSSARY[key]
            return (
              <div key={key} className="policy-glossary-item">
                <dt>{entry.short}</dt>
                <dd>{entry.def}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </section>
  )
}

// MBTA-served transit modes (match MotivationPanels)
const MBTA_MODES = [
  'Rapid Transit',
  'Commuter Rail',
  'Ferry',
  'MBTA Key Bus Route',
]

function parseTransitModes(nTransit) {
  if (!nTransit) return []
  try {
    const parsed = typeof nTransit === 'string' ? JSON.parse(nTransit) : nTransit
    if (!Array.isArray(parsed)) return []
    return parsed.map((t) => String(t).split(':')[0].trim())
  } catch {
    return []
  }
}

function isMbtaServed(modes) {
  return modes.some((m) => MBTA_MODES.includes(m))
}

function computePolicyGapStats(builds) {
  // Aggregate overall near-MBTA vs. away-from-MBTA
  let mbtaHu = 0, mbtaAff = 0, mbtaDeep = 0
  let awayHu = 0, awayAff = 0
  for (const d of builds) {
    const modes = parseTransitModes(d.nTransit)
    const hu = d.hu || 0
    const aff = d.affrdUnit || 0
    const deep = (d.affU30 || 0) + (d.aff3050 || 0)
    if (isMbtaServed(modes)) {
      mbtaHu += hu
      mbtaAff += aff
      mbtaDeep += deep
    } else {
      awayHu += hu
      awayAff += aff
    }
  }

  // Per-municipality, MBTA-served only
  const muniMap = new Map()
  for (const d of builds) {
    const modes = parseTransitModes(d.nTransit)
    if (!isMbtaServed(modes)) continue
    const key = d.municipal || 'Unknown'
    const bucket = muniMap.get(key) || { name: key, hu: 0, aff: 0, devs: 0 }
    bucket.hu += d.hu || 0
    bucket.aff += d.affrdUnit || 0
    bucket.devs += 1
    muniMap.set(key, bucket)
  }
  const munis = Array.from(muniMap.values())
    .filter((m) => m.hu >= 200) // only municipalities with meaningful production
    .map((m) => ({ ...m, affPct: m.hu > 0 ? (m.aff / m.hu) * 100 : 0 }))

  return {
    funnel: {
      mbtaHu,
      mbtaAff,
      mbtaDeep,
      affPct: mbtaHu ? (mbtaAff / mbtaHu) * 100 : 0,
      deepPct: mbtaHu ? (mbtaDeep / mbtaHu) * 100 : 0,
      awayHu,
      awayAff,
      awayAffPct: awayHu ? (awayAff / awayHu) * 100 : 0,
    },
    munis,
  }
}

/* =========================================================================
   Viz A · The collapse: capacity → built → affordable → deep affordability
   ========================================================================= */

function CollapseBars({ funnel }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Each stage is scaled relative to mbtaHu = 100%.
    const stages = [
      {
        key: 'built',
        label: 'Built near MBTA',
        sub: 'All new units within transit-served areas',
        pct: 100,
        count: funnel.mbtaHu,
        note: '100% of what actually got delivered',
        color: '#1a1a1a',
      },
      {
        key: 'aff',
        label: 'Affordable (deed-restricted)',
        sub: 'Any income-restricted unit',
        pct: funnel.affPct,
        count: funnel.mbtaAff,
        note: `${funnel.affPct.toFixed(1)}% of units near transit`,
        color: '#8a9a7b',
      },
      {
        key: 'deep',
        label: 'Deep affordability (<50% AMI)',
        sub: 'Serves the renters with least car access',
        pct: funnel.deepPct,
        count: funnel.mbtaDeep,
        note: `${funnel.deepPct.toFixed(1)}%: the households most in need`,
        color: '#6b1a12',
      },
    ]

    const width = 780
    const margin = { top: 18, right: 110, bottom: 48, left: 270 }
    const rowH = 64
    const height = margin.top + margin.bottom + stages.length * rowH

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    svg.attr('preserveAspectRatio', 'xMidYMid meet')
    const chartW = width - margin.left - margin.right

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, 100]).range([0, chartW])
    const y = d3
      .scaleBand()
      .domain(stages.map((s) => s.key))
      .range([0, stages.length * rowH])
      .padding(0.32)

    // Axis along bottom
    g.append('g')
      .attr('transform', `translate(0, ${stages.length * rowH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((v) => `${v}%`))
      .call((sel) => sel.select('.domain').attr('stroke', '#b9b3a4'))
      .call((sel) => sel.selectAll('text').attr('fill', '#6e6e6e').attr('font-size', 11))
      .call((sel) => sel.selectAll('line').attr('stroke', '#d4d0c4'))

    g.append('text')
      .attr('x', chartW / 2)
      .attr('y', stages.length * rowH + 36)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6e6e6e')
      .attr('font-size', 11)
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text('Share of units built near MBTA transit')

    // Gridlines
    g.append('g')
      .selectAll('line')
      .data(x.ticks(5))
      .enter()
      .append('line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', stages.length * rowH)
      .attr('stroke', '#e8e3d2')
      .attr('stroke-width', 1)

    const rows = g
      .selectAll('g.policy-collapse-row')
      .data(stages)
      .enter()
      .append('g')
      .attr('class', 'policy-collapse-row')
      .attr('transform', (d) => `translate(0, ${y(d.key)})`)

    // Track
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', chartW)
      .attr('height', y.bandwidth())
      .attr('fill', '#efeadb')

    // Value bar
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', (d) => Math.max(x(d.pct), 2))
      .attr('height', y.bandwidth())
      .attr('fill', (d) => d.color)

    // Stage label (left)
    rows
      .append('text')
      .attr('x', -14)
      .attr('y', y.bandwidth() / 2 - 4)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .attr('fill', '#1a1a1a')
      .attr('font-family', 'Inter, sans-serif')
      .text((d) => d.label)

    rows
      .append('text')
      .attr('x', -14)
      .attr('y', y.bandwidth() / 2 + 14)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', 10.5)
      .attr('fill', '#6e6e6e')
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text((d) => d.sub)

    // Percent + count label at end of bar
    rows
      .append('text')
      .attr('x', (d) => Math.max(x(d.pct), 2) + 10)
      .attr('y', y.bandwidth() / 2 - 3)
      .attr('dy', '0.35em')
      .attr('font-size', 14)
      .attr('font-weight', 800)
      .attr('fill', (d) => d.color)
      .attr('font-family', 'Inter, sans-serif')
      .text((d) => `${d.pct.toFixed(1)}%`)

    rows
      .append('text')
      .attr('x', (d) => Math.max(x(d.pct), 2) + 10)
      .attr('y', y.bandwidth() / 2 + 14)
      .attr('dy', '0.35em')
      .attr('font-size', 10.5)
      .attr('fill', '#6e6e6e')
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text((d) => `${d.count.toLocaleString()} units`)
  }, [funnel])

  return <svg ref={svgRef} className="policy-gap-svg" aria-label="Collapse from built to affordable to deeply affordable units near MBTA" />
}

/* =========================================================================
   Viz B · Municipality scatter: units built vs. share affordable
   ========================================================================= */

function MunicipalityScatter({ munis }) {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current || !munis.length) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 720
    const margin = { top: 28, right: 28, bottom: 56, left: 60 }
    const height = 420
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const chartW = width - margin.left - margin.right
    const chartH = height - margin.top - margin.bottom
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xMax = d3.max(munis, (d) => d.hu) || 1
    const x = d3.scaleSqrt().domain([0, xMax]).range([0, chartW]).nice()
    const yMax = Math.max(35, d3.max(munis, (d) => d.affPct) * 1.05)
    const y = d3.scaleLinear().domain([0, yMax]).range([chartH, 0]).nice()

    // Gridlines
    g.append('g')
      .selectAll('line')
      .data(y.ticks(5))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', chartW)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', '#e8e3d2')
      .attr('stroke-width', 1)

    // Reference band: "safe-harbor" cap 10% and ambitious floor 20%
    g.append('rect')
      .attr('x', 0)
      .attr('y', y(20))
      .attr('width', chartW)
      .attr('height', y(10) - y(20))
      .attr('fill', '#f5ecd7')
      .attr('opacity', 0.6)

    const refs = [
      { pct: 10, label: 'MBTA Communities "safe-harbor" cap (10%)', color: '#b36a2a' },
      { pct: 20, label: 'Typical inclusionary floor (20%)', color: '#4d5a3f' },
    ]
    refs.forEach((r) => {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', chartW)
        .attr('y1', y(r.pct))
        .attr('y2', y(r.pct))
        .attr('stroke', r.color)
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '5 4')
      g.append('text')
        .attr('x', chartW - 6)
        .attr('y', y(r.pct) - 5)
        .attr('text-anchor', 'end')
        .attr('font-size', 10.5)
        .attr('font-family', 'DM Sans, Inter, sans-serif')
        .attr('fill', r.color)
        .attr('font-weight', 700)
        .text(r.label)
    })

    // X axis
    g.append('g')
      .attr('transform', `translate(0, ${chartH})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues([500, 2000, 5000, 10000, 25000, 50000].filter((v) => v <= xMax))
          .tickFormat((v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v))
      )
      .call((sel) => sel.select('.domain').attr('stroke', '#b9b3a4'))
      .call((sel) => sel.selectAll('text').attr('fill', '#6e6e6e').attr('font-size', 11))
      .call((sel) => sel.selectAll('line').attr('stroke', '#d4d0c4'))

    g.append('text')
      .attr('x', chartW / 2)
      .attr('y', chartH + 40)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6e6e6e')
      .attr('font-size', 11)
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text('New units built near MBTA (√ scale)')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(6).tickFormat((v) => `${v}%`))
      .call((sel) => sel.select('.domain').attr('stroke', '#b9b3a4'))
      .call((sel) => sel.selectAll('text').attr('fill', '#6e6e6e').attr('font-size', 11))
      .call((sel) => sel.selectAll('line').attr('stroke', '#d4d0c4'))

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -chartH / 2)
      .attr('y', -44)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6e6e6e')
      .attr('font-size', 11)
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text('Share of new units that are affordable')

    // Points
    const dotRadius = (d) => Math.max(4, Math.min(14, Math.sqrt(d.hu) / 6))
    const labelFor = new Set([
      'Boston',
      'Cambridge',
      'Somerville',
      'Lynn',
      'Medford',
      'Malden',
      'Chelsea',
      'Quincy',
      'Revere',
      'Lawrence',
    ])

    const dots = g
      .selectAll('circle.policy-muni-dot')
      .data(munis)
      .enter()
      .append('circle')
      .attr('class', 'policy-muni-dot')
      .attr('cx', (d) => x(d.hu))
      .attr('cy', (d) => y(d.affPct))
      .attr('r', dotRadius)
      .attr('fill', (d) => (d.affPct >= 20 ? '#4d5a3f' : d.affPct >= 10 ? '#b36a2a' : '#DA291C'))
      .attr('fill-opacity', 0.82)
      .attr('stroke', '#1a1a1a')
      .attr('stroke-width', 0.8)
      .style('cursor', 'default')

    dots
      .on('mousemove', function (event, d) {
        d3.select(this).attr('stroke-width', 1.8)
        const tt = tooltipRef.current
        if (!tt) return
        const parent = tt.parentElement.getBoundingClientRect()
        tt.style.left = `${event.clientX - parent.left + 14}px`
        tt.style.top = `${event.clientY - parent.top - 10}px`
        tt.style.opacity = 1
        tt.innerHTML = `
          <div class="motivation-tooltip-title">${d.name}</div>
          <div class="motivation-tooltip-row"><span>Units near MBTA</span><b>${d.hu.toLocaleString()}</b></div>
          <div class="motivation-tooltip-row"><span>Affordable</span><b>${d.aff.toLocaleString()} (${d.affPct.toFixed(1)}%)</b></div>
          <div class="motivation-tooltip-row"><span>Developments</span><b>${d.devs.toLocaleString()}</b></div>
        `
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke-width', 0.8)
        if (tooltipRef.current) tooltipRef.current.style.opacity = 0
      })

    // Labels for key municipalities
    const labeled = munis.filter((m) => labelFor.has(m.name))
    g.selectAll('text.policy-muni-label')
      .data(labeled)
      .enter()
      .append('text')
      .attr('class', 'policy-muni-label')
      .attr('x', (d) => x(d.hu) + dotRadius(d) + 4)
      .attr('y', (d) => y(d.affPct) + 3)
      .attr('font-size', 10.5)
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', 600)
      .attr('fill', '#1a1a1a')
      .text((d) => d.name)
  }, [munis])

  return (
    <div className="policy-gap-scatter-wrap">
      <svg ref={svgRef} className="policy-gap-svg" />
      <div ref={tooltipRef} className="motivation-tooltip" />
    </div>
  )
}

/* =========================================================================
   Viz C · Peer comparison: what other jurisdictions require near transit
   ========================================================================= */

// Each entry = one policy regime. `floor` = required share of affordable units
// (0 if none). `floorLabel` = copy for the bar end.
const PEER_POLICIES = [
  {
    key: 'ma',
    place: 'Massachusetts',
    policy: 'MBTA Communities Act',
    year: 2021,
    floor: 0,
    floorLabel: 'No floor',
    // Realized, from MassBuilds. Wired in at render-time from `funnel`.
    usesRealized: true,
    description:
      'Zones for density near transit but sets no affordability requirement. Local inclusionary ordinances are capped at 10% of units at 80% AMI to remain as-of-right.',
    accent: '#DA291C',
    isFocus: true,
  },
  {
    key: 'mont',
    place: 'Montgomery County, MD',
    policy: 'Moderately-Priced Dwelling Unit (MPDU)',
    year: 1974,
    floor: 13.5, // midpoint of 12.5-15% range
    floorLabel: '12.5–15% required',
    realized: null,
    description:
      'One of the oldest inclusionary-zoning laws in the US. Every development of 20+ units must include 12.5–15% affordable. 17,300+ affordable units produced.',
    accent: '#4d5a3f',
    isFocus: false,
  },
  {
    key: 'sea',
    place: 'Seattle, WA',
    policy: 'Mandatory Housing Affordability',
    year: 2019,
    floor: 9, // city-wide average of 5-11% varying zones
    floorLabel: '5–11% required',
    realized: null,
    description:
      'In exchange for upzoning, every new multifamily project in urban centers and transit areas must either build affordable units or pay into an affordable-housing fund.',
    accent: '#4d5a3f',
    isFocus: false,
  },
  {
    key: 'ca',
    place: 'California',
    policy: 'SB 35 Streamlining',
    year: 2017,
    floor: 20,
    floorLabel: '20% required (Bay Area)',
    realized: null,
    description:
      'By-right, 6-month approval for housing projects that meet local affordability minimums (20% in the Bay Area). 18,000+ units approved in the first five years, most 100% affordable.',
    accent: '#4d5a3f',
    isFocus: false,
  },
  {
    key: 'wa',
    place: 'Washington State',
    policy: 'HB 1491 TOD Law',
    year: 2025,
    floor: 10,
    floorLabel: 'Every TOD must include affordable',
    realized: null,
    description:
      'Requires affordable units in every residential development inside transit station areas, with property-tax exemptions and fee reductions as incentives. Replaces the "safe-harbor cap" approach with a real floor.',
    accent: '#4d5a3f',
    isFocus: false,
  },
]

function PeerComparison({ funnel }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Build the data rows, wiring MA's realized 16.1% in as the comparator.
    const data = PEER_POLICIES.map((p) =>
      p.usesRealized
        ? { ...p, realized: funnel.affPct }
        : p
    )

    const width = 740
    const margin = { top: 16, right: 60, bottom: 54, left: 230 }
    const rowH = 56
    const height = margin.top + margin.bottom + data.length * rowH

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    const chartW = width - margin.left - margin.right
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xMax = 25
    const x = d3.scaleLinear().domain([0, xMax]).range([0, chartW])
    const y = d3
      .scaleBand()
      .domain(data.map((d) => d.key))
      .range([0, data.length * rowH])
      .padding(0.32)

    // Axis
    g.append('g')
      .attr('transform', `translate(0, ${data.length * rowH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((v) => `${v}%`))
      .call((sel) => sel.select('.domain').attr('stroke', '#b9b3a4'))
      .call((sel) => sel.selectAll('text').attr('fill', '#6e6e6e').attr('font-size', 11))
      .call((sel) => sel.selectAll('line').attr('stroke', '#d4d0c4'))

    g.append('text')
      .attr('x', chartW / 2)
      .attr('y', data.length * rowH + 40)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6e6e6e')
      .attr('font-size', 11)
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text('Required affordable share in new development near transit')

    // Gridlines
    g.append('g')
      .selectAll('line')
      .data(x.ticks(5))
      .enter()
      .append('line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', data.length * rowH)
      .attr('stroke', '#e8e3d2')
      .attr('stroke-width', 1)

    const rows = g
      .selectAll('g.policy-peer-row')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'policy-peer-row')
      .attr('transform', (d) => `translate(0, ${y(d.key)})`)

    // Track
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', chartW)
      .attr('height', y.bandwidth())
      .attr('fill', (d) => (d.isFocus ? '#faeaeb' : '#efeadb'))

    // Required-floor bar
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', (d) => Math.max(x(d.floor), 0))
      .attr('height', y.bandwidth())
      .attr('fill', (d) => d.accent)
      .attr('opacity', 0.9)

    // "No floor" marker for MA
    rows
      .filter((d) => d.floor === 0)
      .append('g')
      .attr('transform', `translate(2, ${y.bandwidth() / 2})`)
      .call((sel) => {
        sel
          .append('circle')
          .attr('r', 6)
          .attr('fill', 'none')
          .attr('stroke', '#DA291C')
          .attr('stroke-width', 1.75)
        sel
          .append('line')
          .attr('x1', -4)
          .attr('x2', 4)
          .attr('y1', 0)
          .attr('y2', 0)
          .attr('stroke', '#DA291C')
          .attr('stroke-width', 1.75)
      })

    // Realized marker for MA (separate diamond showing what actually got built)
    rows
      .filter((d) => d.realized != null)
      .append('path')
      .attr(
        'd',
        d3.symbol().type(d3.symbolDiamond).size(110)
      )
      .attr(
        'transform',
        (d) => `translate(${x(Math.min(d.realized, xMax))}, ${y.bandwidth() / 2})`
      )
      .attr('fill', '#1a1a1a')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.25)

    rows
      .filter((d) => d.realized != null)
      .append('text')
      .attr('x', (d) => x(Math.min(d.realized, xMax)) + 12)
      .attr('y', y.bandwidth() / 2 + 4)
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .attr('font-family', 'Inter, sans-serif')
      .attr('fill', '#1a1a1a')
      .text((d) => `${d.realized.toFixed(1)}% realized`)

    // Place label
    rows
      .append('text')
      .attr('x', -12)
      .attr('y', y.bandwidth() / 2 - 5)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .attr('fill', (d) => (d.isFocus ? '#DA291C' : '#1a1a1a'))
      .attr('font-family', 'Inter, sans-serif')
      .text((d) => d.place)

    // Policy sub-label
    rows
      .append('text')
      .attr('x', -12)
      .attr('y', y.bandwidth() / 2 + 11)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', 10.5)
      .attr('fill', '#6e6e6e')
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text((d) => `${d.policy} (${d.year})`)

    // Floor-label at end of bar (skip for MA since "No floor" is shown via icon)
    rows
      .filter((d) => d.floor > 0)
      .append('text')
      .attr('x', (d) => Math.max(x(d.floor), 0) + 10)
      .attr('y', y.bandwidth() / 2 + 4)
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .attr('fill', (d) => d.accent)
      .attr('font-family', 'Inter, sans-serif')
      .text((d) => d.floorLabel)

    rows
      .filter((d) => d.floor === 0)
      .append('text')
      .attr('x', 18)
      .attr('y', y.bandwidth() / 2 + 4)
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .attr('fill', '#DA291C')
      .attr('font-family', 'Inter, sans-serif')
      .text('No statewide floor')
  }, [funnel])

  return <svg ref={svgRef} className="policy-gap-svg" />
}

/* =========================================================================
   Section wrapper
   ========================================================================= */

export default function PolicyGapPanels() {
  const [builds, setBuilds] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    loadMassBuilds()
      .then((data) => {
        if (alive) setBuilds(data)
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const stats = useMemo(() => (builds ? computePolicyGapStats(builds) : null), [builds])

  if (error) {
    return <div className="motivation-empty">Could not load MassBuilds data.</div>
  }
  if (!stats) {
    return (
      <div className="motivation-empty" aria-live="polite">
        Loading MassBuilds data…
      </div>
    )
  }

  const { funnel, munis } = stats
  const gap = funnel.awayAffPct - funnel.affPct

  // Identify outliers for the takeaway text
  const above20 = munis.filter((m) => m.affPct >= 20).length
  const below10 = munis.filter((m) => m.affPct < 10).length
  const between = munis.length - above20 - below10

  return (
    <div className="motivation-stack">
      <GlossaryStrip />

      {/* Viz 1: Collapse bars */}
      <article className="motivation-card">
        <header className="motivation-card-header">
          <span className="motivation-eyebrow">Gap · 01</span>
          <h3>Capacity without affordability is a policy gap, not a policy result.</h3>
          <p className="motivation-dek">
            The MBTA Communities Act requires <Jargon term="as-of-right">as-of-right</Jargon> zoning
            for multi-family housing, not construction, and <strong>sets no income targets</strong>.
            The Affordable Homes Act funds housing, but does not tie its $5.4B to transit
            proximity. What this means, in the units that actually got built near MBTA transit:
          </p>
        </header>

        <CollapseBars funnel={funnel} />

        <div className="motivation-takeaway">
          Housing built <em>near</em> MBTA transit is <strong>{gap.toFixed(1)} percentage points less affordable</strong>{' '}
          than housing built away from transit ({funnel.affPct.toFixed(1)}% vs.{' '}
          {funnel.awayAffPct.toFixed(1)}%). The places with the best transit access are where
          Massachusetts has produced the <em>least</em> affordable housing.
        </div>

        <footer className="motivation-source">
          Source: MassBuilds development inventory (Mar 2026). Policy context:{' '}
          <a href="https://www.mass.gov/info-details/multi-family-zoning-requirement-for-mbta-communities" target="_blank" rel="noopener noreferrer">MBTA Communities</a>{' '}·{' '}
          <a href="https://www.mass.gov/info-details/the-affordable-homes-act-smart-housing-livable-communities" target="_blank" rel="noopener noreferrer">Affordable Homes Act</a>{' '}·{' '}
          <a href="https://www.mapc.org/planning101/affordability-effectiveness-section-3a/" target="_blank" rel="noopener noreferrer">MAPC Section 3A analysis</a>.
        </footer>
      </article>

      {/* Viz 2: Municipality scatter */}
      <article className="motivation-card">
        <header className="motivation-card-header">
          <span className="motivation-eyebrow">Gap · 02</span>
          <h3>With no <Jargon term="affordability floor">affordability floor</Jargon>, outcomes swing from 2% to 28% across the same law.</h3>
          <p className="motivation-dek">
            Every municipality below is subject to the MBTA Communities Act. Each dot is one
            community, sized by units built. With no statewide affordability mandate, some
            communities clear a 20% <Jargon term="inclusionary zoning">inclusionary</Jargon> floor
            while others barely crack 2%.
          </p>
        </header>

        <MunicipalityScatter munis={munis} />

        <div className="motivation-bars-legend">
          <span>
            <span className="motivation-swatch" style={{ background: '#4d5a3f' }} />
            ≥20% affordable · {above20} communities
          </span>
          <span>
            <span className="motivation-swatch" style={{ background: '#b36a2a' }} />
            10–20% · {between} communities
          </span>
          <span>
            <span className="motivation-swatch" style={{ background: '#DA291C' }} />
            &lt;10% · {below10} communities
          </span>
        </div>

        <div className="motivation-takeaway">
          A law that{' '}
          <strong>permits density but doesn&rsquo;t require affordability</strong>{' '}
          lets local politics, not state policy, decide who gets to live near transit. Closing this
          gap means pairing zoning capacity with a minimum affordable share,{' '}
          <Jargon term="AMI">AMI</Jargon> targeting below 80%, and{' '}
          <Jargon term="anti-displacement">anti-displacement protections</Jargon>: the pieces
          Massachusetts&rsquo; two landmark laws leave to local discretion.
        </div>

        <footer className="motivation-source">
          Source: MassBuilds (Mar 2026), MBTA-served municipalities with at least 200 new units
          on record. Reference lines reflect the{' '}
          <a href="https://www.mapc.org/planning101/affordability-effectiveness-section-3a/" target="_blank" rel="noopener noreferrer">
            10% / 80% AMI &ldquo;<Jargon term="safe-harbor cap">safe-harbor cap</Jargon>&rdquo;
          </a>{' '}
          under <Jargon term="Section 3A">Section 3A</Jargon> and a typical 20% inclusionary floor.
        </footer>
      </article>

      {/* Viz 3: Peer comparison */}
      <article className="motivation-card">
        <header className="motivation-card-header">
          <span className="motivation-eyebrow">Gap · 03</span>
          <h3>Other states solved the same problem by requiring a floor.</h3>
          <p className="motivation-dek">
            Massachusetts isn&rsquo;t the first state to <Jargon term="upzone">upzone</Jargon>{' '}
            near transit. Four peer jurisdictions paired density with a{' '}
            <strong>statewide or county-wide <Jargon term="affordability floor">affordability
            floor</Jargon></strong>: the exact lever MBTA Communities left out. The bar
            below shows the required share of affordable units in each regime; the black
            diamond on the top row is what MA has <em>actually</em> built near MBTA, with no
            floor in place.
          </p>
        </header>

        <PeerComparison funnel={funnel} />

        <div className="policy-peer-grid">
          {PEER_POLICIES.filter((p) => !p.isFocus).map((p) => (
            <div key={p.key} className="policy-peer-card">
              <div className="policy-peer-card-header">
                <span className="policy-peer-card-place">{p.place}</span>
                <span className="policy-peer-card-year">{p.year}</span>
              </div>
              <div className="policy-peer-card-policy">{p.policy}</div>
              <p className="policy-peer-card-desc">{p.description}</p>
            </div>
          ))}
        </div>

        <div className="motivation-takeaway">
          The common thread across Montgomery County, Seattle, California, and Washington is
          simple: <strong>they require a minimum share of affordable units</strong> in the same
          developments that MBTA Communities enables. Massachusetts has built the zoning. The
          missing piece is the floor: a statutory minimum that converts capacity into
          the homes transit-dependent households can actually afford.
        </div>

        <footer className="motivation-source">
          Sources:{' '}
          <a href="https://montgomerycountymd.gov/DHCA/housing/singlefamily/mpdu/produced.html" target="_blank" rel="noopener noreferrer">Montgomery County MPDU production</a>{' '}·{' '}
          <a href="https://www.seattle.gov/housing/housing-developers/mandatory-housing-affordability" target="_blank" rel="noopener noreferrer">Seattle MHA program</a>{' '}·{' '}
          <a href="https://ternercenter.berkeley.edu/research-and-policy/sb-35-evaluation/" target="_blank" rel="noopener noreferrer">Terner Center SB 35 evaluation</a>{' '}·{' '}
          <a href="https://app.leg.wa.gov/billsummary?BillNumber=1491&Year=2025" target="_blank" rel="noopener noreferrer">Washington HB 1491</a>.
          MA realized figure: MassBuilds (Mar 2026).
        </footer>
      </article>
    </div>
  )
}
