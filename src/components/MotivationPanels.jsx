import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { loadMassBuilds } from '../utils/dataLoaders'

// MBTA-served transit modes (excludes regional RTA bus systems outside MBTA)
const MBTA_MODES = [
  'Rapid Transit',
  'Commuter Rail',
  'Ferry',
  'MBTA Key Bus Route',
]

// Hover-triggered glossary for jargon used in the Evidence panels. Mirrors the
// pattern used in PolicyGapPanels (same CSS classes in scrolly.css).
const MOTIVATION_GLOSSARY = {
  'AMI': {
    short: 'Area Median Income (AMI)',
    def: 'HUD-published benchmark used to set income eligibility for affordable housing. 100% AMI for a 2-person Boston household = $127,200 in 2024.',
  },
  'any affordable': {
    short: '"Any affordable"',
    def: 'Every deed-restricted unit reported to MassBuilds, at any AMI band. Includes deep-affordability units (under 50% AMI) but also workforce units priced for households earning 80%+ AMI (~$102k+ for a 2-person Boston household). A unit being "affordable" in the data only means its rent is income-capped by a legal covenant, not that it is affordable to a low-income renter.',
  },
  'deed-restricted': {
    short: 'Deed-restricted',
    def: 'Units with a legal covenant on the property that caps rent or sale price to stay affordable for a set period (typically 30+ years).',
  },
}

function Jargon({ term, children }) {
  const entry = MOTIVATION_GLOSSARY[term]
  if (!entry) return <span>{children ?? term}</span>
  return (
    <span className="jargon-term" tabIndex={0} aria-describedby={`motivation-glossary-${term}`}>
      {children ?? term}
      <span className="jargon-tooltip" role="tooltip" id={`motivation-glossary-${term}`}>
        <span className="jargon-tooltip-label">{entry.short}</span>
        <span className="jargon-tooltip-def">{entry.def}</span>
      </span>
    </span>
  )
}

// Explains the proportional split of "affordable, no band" units (same as PolicyGap / supply useMemo).
function WaffleMethodInfo() {
  return (
    <span
      className="jargon-term motivation-method-icon"
      tabIndex={0}
      aria-describedby="motivation-waffle-method-tip"
    >
      <span className="motivation-method-glyph" aria-hidden="true">i</span>
      <span className="jargon-tooltip" role="tooltip" id="motivation-waffle-method-tip">
        <span className="jargon-tooltip-label">How we count the mix</span>
        <span className="jargon-tooltip-def">
          MassBuilds usually tags deed-restricted units with an AMI band (&lt;30% through
          80%+). A portion are only labeled <em>affordable</em> with no band. We distribute
          those across the four bands in proportion to units that <em>do</em> have a band
          (identical to the way the 100% strip on the next card is computed). The waffle,
          the legend, and the &ldquo;X of 100&rdquo; line there use the same model.
          Market-rate is unchanged. See the footnote for how much of the pipeline is
          affected in this data pull.
        </span>
      </span>
    </span>
  )
}

// AMI tiers used in the waffle. Tooltip text is the inline explanation
// shown under each legend row; phrased to lead with a concrete dollar
// income (2-person household, Boston-area HUD limits) and add a short
// plain-language framing rather than restating the AMI percentage.
const AMI_CATS = [
  {
    key: 'u30',
    label: 'Very low income',
    sub: '<30% AMI',
    color: '#6b2b27',
    tooltip:
      'For households earning under ~$38k a year.',
  },
  {
    key: 'a3050',
    label: 'Low income',
    sub: '30–50% AMI',
    color: '#a14a35',
    tooltip:
      'For households earning ~$38k–$64k a year: full-time minimum-wage earners and fixed-income seniors.',
  },
  {
    key: 'a5080',
    label: 'Moderate income',
    sub: '50–80% AMI',
    color: '#d38e42',
    tooltip:
      'For households earning ~$64k–$102k a year: most of the working middle class.',
  },
  {
    key: 'a80p',
    label: 'Workforce',
    sub: '80%+ AMI',
    color: '#e9c46a',
    tooltip:
      'For households earning $102k or more: above typical Boston-area renter income.',
  },
  {
    key: 'affOther',
    label: 'Affordable, income level unknown',
    sub: 'no AMI reported',
    color: '#b6c4a7',
    tooltip:
      'These units have an income cap (they are deed-restricted affordable), but the source data does not record how strict the cap is, so we cannot place them in one of the bands above.',
  },
  {
    key: 'market',
    label: 'Market-rate',
    sub: 'no restriction',
    color: '#d4d0c4',
    tooltip:
      'No income cap. Rented or sold at whatever price the market will pay.',
  },
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

function computeStats(builds) {
  const mbta = builds.filter((d) => isMbtaServed(parseTransitModes(d.nTransit)))

  let hu = 0, aff = 0, u30 = 0, a3050 = 0, a5080 = 0, a80p = 0
  for (const d of mbta) {
    hu += d.hu || 0
    aff += d.affrdUnit || 0
    u30 += d.affU30 || 0
    a3050 += d.aff3050 || 0
    a5080 += d.aff5080 || 0
    a80p += d.aff80p || 0
  }
  const affOther = Math.max(0, aff - (u30 + a3050 + a5080 + a80p))
  const market = Math.max(0, hu - aff)

  const breakdown = {
    u30, a3050, a5080, a80p, affOther, market,
  }

  return { hu, aff, breakdown, devs: mbta.length }
}

// === Occupations strip (F) ===
// BLS OEWS Boston-Cambridge-Nashua, MA-NH, May 2023 median annual wages
// (median hourly wage × 2080 hrs/yr, the BLS standard conversion). Elementary
// school teachers (25-2021) are salaried and BLS suppresses median hourly for
// that area, so we substitute the published annual mean. AMI % is computed
// against the Boston HMFA 100% AMI for a 2-person household ($127,200) so it
// lines up with our supply-side AMI bands.
// Source: https://www.bls.gov/oes/2023/May/oes_71650.htm
const BOSTON_AMI_100_2P = 127200
const OCCUPATIONS = [
  { name: 'Retail salesperson', wage: 36170, soc: '41-2031' },
  { name: 'Home health aide', wage: 37440, soc: '31-1120' },
  { name: 'Childcare worker', wage: 39120, soc: '39-9011' },
  { name: 'Janitor', wage: 39940, soc: '37-2011' },
  { name: 'Line cook', wage: 44200, soc: '35-2014' },
  { name: 'Preschool teacher', wage: 45300, soc: '25-2011' },
  { name: 'EMT', wage: 46090, soc: '29-2042' },
  { name: 'MBTA bus driver', wage: 62520, soc: '53-3052' },
  { name: 'Construction laborer', wage: 62920, soc: '47-2061' },
  { name: 'Firefighter', wage: 75050, soc: '33-2011' },
  { name: 'Police officer', wage: 76560, soc: '33-3051' },
  { name: 'Elementary school teacher', wage: 87660, soc: '25-2021' },
  { name: 'Registered nurse', wage: 100360, soc: '29-1141' },
  { name: 'Software engineer', wage: 135300, soc: '15-1252' },
]

function allocateWaffle(breakdown) {
  // Distribute 100 cells proportional to counts, using largest-remainder so the
  // thin slivers (<30% AMI, 30–50% AMI) are preserved rather than rounded to 0.
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0)
  if (!total) return []
  const order = ['u30', 'a3050', 'a5080', 'a80p', 'affOther', 'market']
  const raw = order.map((k) => ({ key: k, exact: (breakdown[k] / total) * 100 }))
  const withFloor = raw.map((r) => {
    let floor = Math.floor(r.exact)
    // Give a guaranteed 1 cell to deep-affordability tiers if any units exist
    if (floor === 0 && (r.key === 'u30' || r.key === 'a3050') && breakdown[r.key] > 0) {
      floor = 1
    }
    return { ...r, floor, frac: r.exact - Math.floor(r.exact) }
  })
  let assigned = withFloor.reduce((s, r) => s + r.floor, 0)
  // Fill remaining cells by largest fractional part, taking from market last if overfilled
  if (assigned < 100) {
    const remainders = withFloor
      .map((r, i) => ({ i, frac: r.frac }))
      .sort((a, b) => b.frac - a.frac)
    let j = 0
    while (assigned < 100 && j < remainders.length * 10) {
      withFloor[remainders[j % remainders.length].i].floor += 1
      assigned += 1
      j += 1
    }
  } else if (assigned > 100) {
    // Over by rounding up: peel off market cells
    const marketIdx = withFloor.findIndex((r) => r.key === 'market')
    while (assigned > 100 && marketIdx >= 0 && withFloor[marketIdx].floor > 0) {
      withFloor[marketIdx].floor -= 1
      assigned -= 1
    }
  }
  return withFloor.map((r) => ({ key: r.key, count: r.floor }))
}

function WaffleChart({ breakdown, hovered, onHover }) {
  const cells = useMemo(() => allocateWaffle(breakdown), [breakdown])
  const flat = []
  for (const seg of cells) {
    for (let i = 0; i < seg.count; i++) flat.push(seg.key)
  }
  // Pad / trim to exactly 100
  while (flat.length < 100) flat.push('market')
  while (flat.length > 100) flat.pop()

  // Reorder so market-rate (dominant) is at the back, affordable tiers stand out in front rows.
  // Simple approach: keep canonical order so "affordable" cluster is top-left, market fills bottom-right.
  return (
    <div className="motivation-waffle" role="img" aria-label="Waffle chart of AMI breakdown of new MBTA-near housing, rendered as colored house icons">
      {flat.map((key, i) => {
        const cat = AMI_CATS.find((c) => c.key === key)
        const isDim = hovered && hovered !== key
        const fill = cat?.color || '#ccc'
        return (
          <div
            key={i}
            className="motivation-waffle-cell"
            data-key={key}
            style={{ opacity: isDim ? 0.22 : 1 }}
            onMouseEnter={() => onHover(key)}
            onMouseLeave={() => onHover(null)}
          >
            <svg
              viewBox="0 0 24 24"
              className="motivation-waffle-house"
              aria-hidden="true"
            >
              {/* House silhouette: pitched roof + body. Drawn as a single
                  filled path so it scales cleanly and inherits the AMI tier
                  color via the fill prop. */}
              <path
                d="M12 3 L2 13 L5 13 L5 22 L19 22 L19 13 L22 13 Z"
                fill={fill}
              />
            </svg>
            <span className="sr-only">{cat?.label}</span>
          </div>
        )
      })}
    </div>
  )
}


// Occupations strip. Plot common Boston jobs against the AMI scale, reusing
// the same color tiers as the Evidence 01 waffle so the reader can map a
// worker's position straight back to the unit-mix shown above.
function OccupationStrip() {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 760
    const margin = { top: 24, right: 30, bottom: 56, left: 30 }
    const stripH = 46
    const occH = 320

    const amiStripY = 0
    const occY = amiStripY + stripH + 12
    const axisY = occY + occH

    const height = margin.top + axisY + margin.bottom

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    const chartW = width - margin.left - margin.right
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const maxAmi = 130
    const x = d3.scaleLinear().domain([0, maxAmi]).range([0, chartW])

    // AMI reference scale — same colors as the Evidence 01 waffle so the
    // reader can map a worker's position straight back to the unit-mix
    // shown above. This strip is purely a reference axis for the
    // occupation dots; it is not a quantitative bar.
    const bands = [
      { key: 'u30', x0: 0, x1: 30, color: '#6b2b27', name: 'Very low income', sub: '<30% AMI' },
      { key: 'a3050', x0: 30, x1: 50, color: '#a14a35', name: 'Low income', sub: '30–50% AMI' },
      { key: 'a5080', x0: 50, x1: 80, color: '#d38e42', name: 'Moderate income', sub: '50–80% AMI' },
      { key: 'a80p', x0: 80, x1: maxAmi, color: '#e9c46a', name: 'Workforce', sub: '80%+ AMI' },
    ]

    const stripG = g.append('g').attr('transform', `translate(0, ${amiStripY})`)

    stripG
      .append('g')
      .selectAll('rect.band')
      .data(bands)
      .enter()
      .append('rect')
      .attr('class', 'band')
      .attr('x', (d) => x(d.x0))
      .attr('y', 0)
      .attr('width', (d) => x(d.x1) - x(d.x0))
      .attr('height', stripH)
      .attr('fill', (d) => d.color)
      .attr('opacity', 0.55)

    stripG
      .append('g')
      .selectAll('text.band-name')
      .data(bands)
      .enter()
      .append('text')
      .attr('x', (d) => (x(d.x0) + x(d.x1)) / 2)
      .attr('y', stripH / 2 - 4)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .attr('fill', (d) => (d.key === 'a80p' ? '#5a4a1a' : '#fffaee'))
      .text((d) => d.name)

    stripG
      .append('g')
      .selectAll('text.band-sub')
      .data(bands)
      .enter()
      .append('text')
      .attr('x', (d) => (x(d.x0) + x(d.x1)) / 2)
      .attr('y', stripH / 2 + 11)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', 9.5)
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .attr('fill', (d) => (d.key === 'a80p' ? '#5a4a1a' : '#fffaee'))
      .attr('opacity', 0.85)
      .text((d) => d.sub)

    // Occupations area
    const occG = g.append('g').attr('transform', `translate(0, ${occY})`)

    const sorted = [...OCCUPATIONS]
      .map((o) => ({ ...o, ami: (o.wage / BOSTON_AMI_100_2P) * 100 }))
      .sort((a, b) => a.ami - b.ami)

    const y = d3
      .scaleBand()
      .domain(sorted.map((o) => o.name))
      .range([0, occH])
      .padding(0.18)

    occG
      .append('g')
      .selectAll('line.guide')
      .data(sorted)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', (d) => x(d.ami))
      .attr('y1', (d) => y(d.name) + y.bandwidth() / 2)
      .attr('y2', (d) => y(d.name) + y.bandwidth() / 2)
      .attr('stroke', '#cfc8b6')
      .attr('stroke-width', 1)

    occG
      .append('g')
      .selectAll('circle.occ')
      .data(sorted)
      .enter()
      .append('circle')
      .attr('class', 'occ')
      .attr('cx', (d) => x(d.ami))
      .attr('cy', (d) => y(d.name) + y.bandwidth() / 2)
      .attr('r', 6)
      .attr('fill', (d) => {
        if (d.ami < 30) return '#6b2b27'
        if (d.ami < 50) return '#a14a35'
        if (d.ami < 80) return '#d38e42'
        return '#e9c46a'
      })
      .attr('stroke', '#fffaee')
      .attr('stroke-width', 1.5)
      .on('mousemove', (event, d) => {
        const tt = tooltipRef.current
        if (!tt) return
        const parent = tt.parentElement.getBoundingClientRect()
        tt.style.left = `${event.clientX - parent.left + 14}px`
        tt.style.top = `${event.clientY - parent.top - 10}px`
        tt.style.opacity = 1
        tt.innerHTML = `
          <div class="motivation-tooltip-title">${d.name}</div>
          <div class="motivation-tooltip-row"><span>Median wage (Boston MSA)</span><b>$${d.wage.toLocaleString()}</b></div>
          <div class="motivation-tooltip-row"><span>As % of 100% AMI (2p)</span><b>${d.ami.toFixed(1)}%</b></div>
        `
      })
      .on('mouseleave', () => {
        if (tooltipRef.current) tooltipRef.current.style.opacity = 0
      })

    occG
      .append('g')
      .selectAll('text.occ-label')
      .data(sorted)
      .enter()
      .append('text')
      .attr('x', (d) => x(d.ami) + 12)
      .attr('y', (d) => y(d.name) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('font-size', 12)
      .attr('font-family', 'Inter, sans-serif')
      .attr('fill', '#1a1a1a')
      .text((d) => `${d.name} · $${(d.wage / 1000).toFixed(0)}k`)

    // Bottom AMI axis
    g.append('g')
      .attr('transform', `translate(0, ${axisY})`)
      .call(d3.axisBottom(x).ticks(7).tickFormat((v) => `${v}%`))
      .call((sel) => sel.select('.domain').attr('stroke', '#b9b3a4'))
      .call((sel) => sel.selectAll('text').attr('fill', '#6e6e6e').attr('font-size', 11))
      .call((sel) => sel.selectAll('line').attr('stroke', '#d4d0c4'))

    g.append('text')
      .attr('x', chartW / 2)
      .attr('y', axisY + 42)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6e6e6e')
      .attr('font-size', 11)
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text('Worker income, as % of Boston Area Median Income (100% AMI = $127k for a 2-person household)')
  }, [])

  return (
    <div className="motivation-bars-wrap">
      <svg ref={svgRef} className="motivation-bars-svg" />
      <div ref={tooltipRef} className="motivation-tooltip" />
    </div>
  )
}


export default function MotivationPanels({ view = 'all' }) {
  const showWaffle = view === 'all' || view === 'waffle'
  const showOccupations = view === 'all' || view === 'occupations'
  const [builds, setBuilds] = useState(null)
  const [error, setError] = useState(false)
  const [hoverKey, setHoverKey] = useState(null)

  useEffect(() => {
    let alive = true
    loadMassBuilds()
      .then((buildsData) => {
        if (!alive) return
        setBuilds(buildsData)
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const stats = useMemo(() => (builds ? computeStats(builds) : null), [builds])

  // Supply-side distribution near MBTA transit, in the same 4 AMI bands plus
  // a separate market-rate segment. `affOther` (deed-restricted but tier
  // unspecified) is allocated proportionally across the four affordable bands
  // so the supply bar still adds to 100%.
  const supply = useMemo(() => {
    if (!stats) return null
    const { breakdown, hu } = stats
    const knownAff = breakdown.u30 + breakdown.a3050 + breakdown.a5080 + breakdown.a80p
    const splitOther = (band) => {
      if (knownAff <= 0) return 0
      return breakdown.affOther * (breakdown[band] / knownAff)
    }
    return {
      total: hu,
      values: {
        u30: breakdown.u30 + splitOther('u30'),
        a3050: breakdown.a3050 + splitOther('a3050'),
        a5080: breakdown.a5080 + splitOther('a5080'),
        a80p: breakdown.a80p + splitOther('a80p'),
        market: breakdown.market,
      },
    }
  }, [stats])

  if (error) {
    return (
      <div className="motivation-empty">Could not load MassBuilds data.</div>
    )
  }
  if (!stats || !supply) {
    return (
      <div className="motivation-empty" aria-live="polite">Loading MassBuilds data…</div>
    )
  }

  const { hu, devs, breakdown: rawBreakdown } = stats
  const affOtherRaw = rawBreakdown.affOther
  const affOtherPctOfPipeline = hu > 0 ? (affOtherRaw / hu) * 100 : 0
  // Same effective mix as the occupations copy below: `affOther` (deed-restricted
  // but no AMI band in the data) is split across the four affordable bands
  // proportionally, so the waffle + legend are not 2/100 here and 4/100 there.
  const displayBreakdown = {
    u30: supply.values.u30,
    a3050: supply.values.a3050,
    a5080: supply.values.a5080,
    a80p: supply.values.a80p,
    affOther: 0,
    market: supply.values.market,
  }
  const deepTotal = displayBreakdown.u30 + displayBreakdown.a3050
  const pctDeep = (deepTotal / hu) * 100

  const waffleLegend = AMI_CATS.map((c) => {
    const count = displayBreakdown[c.key] || 0
    return { ...c, count, pct: (count / hu) * 100 }
  }).filter((l) => l.key !== 'affOther' || l.count > 0)

  return (
    <div className="motivation-stack">
      {/* Visualization 1: Waffle chart */}
      {showWaffle && (
      <article className="motivation-card">
        <header className="motivation-card-header">
          <h3 className="motivation-h3-with-method">
            <span>Of every 100 new homes built near MBTA transit&hellip;</span>
            <WaffleMethodInfo />
          </h3>
          <p className="motivation-dek">
            Across <strong>{devs.toLocaleString()}</strong> completed and in-progress developments
            near rapid transit, commuter rail, ferry, and key bus routes, the income mix of{' '}
            <strong>{hu.toLocaleString()}</strong> new units looks like this. The{' '}
            <span className="motivation-inline-i" aria-hidden="true">(i)</span> next to the
            title explains when we have to apportion &ldquo;affordable&rdquo; units that lack
            a band in MassBuilds.
          </p>
        </header>

        <div className="motivation-waffle-layout">
          <WaffleChart
            breakdown={displayBreakdown}
            hovered={hoverKey}
            onHover={setHoverKey}
          />
          <div className="motivation-waffle-legend">
            {waffleLegend.map((l) => (
              <div
                key={l.key}
                className={`motivation-legend-row ${hoverKey && hoverKey !== l.key ? 'is-dim' : ''}`}
                onMouseEnter={() => setHoverKey(l.key)}
                onMouseLeave={() => setHoverKey(null)}
              >
                <span className="motivation-legend-swatch" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="motivation-legend-house">
                    <path
                      d="M12 3 L2 13 L5 13 L5 22 L19 22 L19 13 L22 13 Z"
                      fill={l.color}
                    />
                  </svg>
                </span>
                <div className="motivation-legend-text">
                  <div className="motivation-legend-label">
                    {l.label}
                    <span className="motivation-legend-sub"> · {l.sub}</span>
                  </div>
                  <div className="motivation-legend-stats">
                    <span className="motivation-legend-pct">{l.pct.toFixed(1)}%</span>
                    <span className="motivation-legend-count">{l.count.toLocaleString()} units</span>
                  </div>
                  <div className="motivation-legend-tip">{l.tooltip}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="motivation-takeaway">
          Only <strong>{pctDeep.toFixed(1)}%</strong> of new units near MBTA transit are designated for households earning below 50% AMI. Those are the renters with the least ability to afford a car, and the most to gain from living near transit. 
          The remaining <strong>{((displayBreakdown.market / hu) * 100).toFixed(0)}%</strong> are market-rate, with no income restriction.
        </div>

        <footer className="motivation-source">
          <p>
            Source: MassBuilds development inventory (Mar 2026), filtered to completed &amp;
            under-construction projects tagged near MBTA Rapid Transit, Commuter Rail, Ferry, or Key Bus routes.
          </p>
          <p className="motivation-source-method">
            <strong>Method.</strong> Deed-restricted units in MassBuilds with no specific AMI
            band are distributed across the four reported bands in proportion to band-specific
            unit counts, so the waffle, legend, and the share on the next card use one
            model{affOtherRaw > 0 ? (
              <>
                {'. '}
                In this dataset, that is <strong>{affOtherPctOfPipeline.toFixed(1)}%</strong> of
                the pipeline (<strong>{affOtherRaw.toLocaleString()}</strong> of{' '}
                <strong>{hu.toLocaleString()}</strong> units, reported only as affordable with no
                specific band, before apportioning).
              </>
            ) : (
              '.'
            )}{' '}
            Market-rate counts are not affected.
          </p>
        </footer>
      </article>
      )}

      {/* Visualization 2: Who is the new housing actually for? */}
      {showOccupations && (
      <article className="motivation-card">
        <header className="motivation-card-header">
          <h3>The people who keep Boston running can&rsquo;t afford the housing built next to their bus stop.</h3>
          <p className="motivation-dek">
            Across <strong>{OCCUPATIONS.length}</strong> common Greater Boston occupations,
            from childcare workers and line cooks at the bottom of the wage ladder to
            teachers, nurses, and software engineers at the top, median wages line up
            against the same <Jargon term="AMI">AMI</Jargon> tiers shown in the visualization above.
          </p>
        </header>

        <OccupationStrip />

        <div className="motivation-takeaway">
          Childcare workers, line cooks, and EMTs earn under 50% AMI: only{' '}
          <strong>{((supply.values.u30 + supply.values.a3050) / supply.total * 100).toFixed(0)}</strong>{' '}
          of every 100 new MBTA-near units are priced for them, using the same unit-mix
          model as the chart above. Only at the software-engineer tier (above 80% AMI) does
          market-rate housing near transit start to feel within reach.
        </div>

        <footer className="motivation-source">
          <p>
            Wages: U.S. Bureau of Labor Statistics, Occupational Employment and
            Wage Statistics (OEWS), May 2023, Boston-Cambridge-Nashua MA-NH MSA, median
            annual wage by SOC code. AMI base: HUD FY2024 income limits, Boston HMFA,
            2-person 100% AMI = $127,200. Hover any dot for the underlying numbers.
          </p>
          <p className="motivation-source-method">
            <strong>Unit-mix line.</strong> The &ldquo;of 100&rdquo; line uses the
            same MassBuilds allocation (including no-band units) as the 100-homes
            card above.
          </p>
        </footer>
      </article>
      )}
    </div>
  )
}
