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

const AMI_CATS = [
  {
    key: 'u30',
    label: 'Very low income',
    sub: '<30% AMI',
    color: '#6b2b27',
    tooltip:
      'Affordable to households earning less than 30% of Area Median Income (~under $38k for a 2-person household in Boston).',
  },
  {
    key: 'a3050',
    label: 'Low income',
    sub: '30–50% AMI',
    color: '#a14a35',
    tooltip:
      'Affordable to households earning 30–50% of Area Median Income (~$38k–$64k for a 2-person household).',
  },
  {
    key: 'a5080',
    label: 'Moderate income',
    sub: '50–80% AMI',
    color: '#d38e42',
    tooltip:
      'Affordable to households earning 50–80% of AMI (~$64k–$102k for a 2-person household).',
  },
  {
    key: 'a80p',
    label: 'Workforce',
    sub: '80%+ AMI',
    color: '#e9c46a',
    tooltip:
      'Affordable to households earning 80%+ of AMI (~$102k+ for a 2-person household).',
  },
  {
    key: 'affOther',
    label: 'Affordable, tier unspecified',
    sub: 'no AMI reported',
    color: '#b6c4a7',
    tooltip:
      'MassBuilds records these units as deed-restricted affordable but does not specify which AMI band they serve.',
  },
  {
    key: 'market',
    label: 'Market-rate',
    sub: 'no restriction',
    color: '#d4d0c4',
    tooltip: 'Units rented or sold at market price, with no income-based restriction.',
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

function primaryTransitTier(modes) {
  if (modes.includes('Rapid Transit')) return 'Rapid Transit'
  if (modes.includes('Commuter Rail')) return 'Commuter Rail'
  if (modes.includes('Ferry')) return 'Ferry'
  if (modes.includes('MBTA Key Bus Route')) return 'MBTA Key Bus'
  if (modes.includes('RTA')) return 'Regional Bus (RTA)'
  return 'No transit'
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

  // Per-transit-tier stats
  const tierOrder = ['Rapid Transit', 'Commuter Rail', 'Ferry', 'MBTA Key Bus', 'Regional Bus (RTA)', 'No transit']
  const tierMap = Object.fromEntries(
    tierOrder.map((t) => [t, { tier: t, hu: 0, aff: 0, deep: 0, devs: 0 }])
  )
  for (const d of builds) {
    const modes = parseTransitModes(d.nTransit)
    const tier = primaryTransitTier(modes)
    const bucket = tierMap[tier]
    bucket.devs += 1
    bucket.hu += d.hu || 0
    bucket.aff += d.affrdUnit || 0
    bucket.deep += (d.affU30 || 0) + (d.aff3050 || 0)
  }
  const tiers = tierOrder
    .map((t) => {
      const b = tierMap[t]
      return {
        ...b,
        affPct: b.hu > 0 ? (b.aff / b.hu) * 100 : 0,
        deepPct: b.hu > 0 ? (b.deep / b.hu) * 100 : 0,
      }
    })
    .filter((t) => t.hu > 0)

  return { hu, aff, breakdown, tiers, devs: mbta.length }
}

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
    <div className="motivation-waffle" role="img" aria-label="Waffle chart of AMI breakdown of new MBTA-near housing">
      {flat.map((key, i) => {
        const cat = AMI_CATS.find((c) => c.key === key)
        const isDim = hovered && hovered !== key
        return (
          <div
            key={i}
            className="motivation-waffle-cell"
            data-key={key}
            style={{
              background: cat?.color || '#ccc',
              opacity: isDim ? 0.22 : 1,
            }}
            onMouseEnter={() => onHover(key)}
            onMouseLeave={() => onHover(null)}
          >
            <span className="sr-only">{cat?.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function TransitBars({ tiers }) {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current || !tiers.length) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Sort from highest-capacity transit at top (most service) to least
    const order = ['Rapid Transit', 'Commuter Rail', 'Ferry', 'MBTA Key Bus', 'Regional Bus (RTA)', 'No transit']
    const data = order
      .map((t) => tiers.find((x) => x.tier === t))
      .filter(Boolean)

    const width = 640
    const margin = { top: 18, right: 80, bottom: 36, left: 150 }
    const rowH = 46
    const height = margin.top + margin.bottom + data.length * rowH

    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const chartW = width - margin.left - margin.right
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xMax = Math.max(30, d3.max(data, (d) => d.affPct) * 1.05)
    const x = d3.scaleLinear().domain([0, xMax]).range([0, chartW])
    const y = d3
      .scaleBand()
      .domain(data.map((d) => d.tier))
      .range([0, data.length * rowH])
      .padding(0.28)

    // Axis
    g.append('g')
      .attr('transform', `translate(0, ${data.length * rowH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((v) => `${v}%`))
      .call((sel) => sel.select('.domain').attr('stroke', '#b9b3a4'))
      .call((sel) => sel.selectAll('text').attr('fill', '#6e6e6e').attr('font-size', 11))
      .call((sel) => sel.selectAll('line').attr('stroke', '#d4d0c4'))

    g.append('text')
      .attr('x', chartW / 2)
      .attr('y', data.length * rowH + 30)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6e6e6e')
      .attr('font-size', 11)
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text('Share of new units that are affordable (deed-restricted)')

    // Gridlines
    g.append('g')
      .attr('class', 'motivation-gridlines')
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

    // Row groups
    const rows = g
      .selectAll('g.motivation-row')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'motivation-row')
      .attr('transform', (d) => `translate(0, ${y(d.tier)})`)

    // Bar track
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', chartW)
      .attr('height', y.bandwidth())
      .attr('fill', '#efeadb')

    // Affordable bar, with Rapid Transit drawn in the story accent color
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', (d) => x(d.affPct))
      .attr('height', y.bandwidth())
      .attr('fill', (d) => (d.tier === 'Rapid Transit' ? '#DA291C' : '#8a9a7b'))

    // Deep-affordability sub-bar (<50% AMI) layered inside
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', (d) => x(d.deepPct))
      .attr('height', y.bandwidth())
      .attr('fill', (d) => (d.tier === 'Rapid Transit' ? '#6b1a12' : '#4d5a3f'))
      .attr('opacity', 0.9)

    // Tier label (left)
    rows
      .append('text')
      .attr('x', -12)
      .attr('y', y.bandwidth() / 2 + 1)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', 12.5)
      .attr('font-weight', 600)
      .attr('fill', '#1a1a1a')
      .attr('font-family', 'Inter, sans-serif')
      .text((d) => d.tier)

    // Unit-count sub-label
    rows
      .append('text')
      .attr('x', -12)
      .attr('y', y.bandwidth() / 2 + 15)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', 10)
      .attr('fill', '#6e6e6e')
      .attr('font-family', 'DM Sans, Inter, sans-serif')
      .text((d) => `${d.hu.toLocaleString()} units`)

    // Percentage label at end of bar
    rows
      .append('text')
      .attr('x', (d) => x(d.affPct) + 8)
      .attr('y', y.bandwidth() / 2 + 1)
      .attr('dy', '0.35em')
      .attr('font-size', 12)
      .attr('font-weight', 700)
      .attr('fill', (d) => (d.tier === 'Rapid Transit' ? '#DA291C' : '#1a1a1a'))
      .attr('font-family', 'Inter, sans-serif')
      .text((d) => `${d.affPct.toFixed(1)}%`)

    // Hover tooltip
    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', chartW)
      .attr('height', y.bandwidth())
      .attr('fill', 'transparent')
      .style('cursor', 'default')
      .on('mousemove', (event, d) => {
        const tt = tooltipRef.current
        if (!tt) return
        const parent = tt.parentElement.getBoundingClientRect()
        tt.style.left = `${event.clientX - parent.left + 14}px`
        tt.style.top = `${event.clientY - parent.top - 10}px`
        tt.style.opacity = 1
        tt.innerHTML = `
          <div class="motivation-tooltip-title">${d.tier}</div>
          <div class="motivation-tooltip-row"><span>Total units</span><b>${d.hu.toLocaleString()}</b></div>
          <div class="motivation-tooltip-row"><span>Affordable units</span><b>${d.aff.toLocaleString()} (${d.affPct.toFixed(1)}%)</b></div>
          <div class="motivation-tooltip-row"><span>Deep affordability (&lt;50% AMI)</span><b>${d.deep.toLocaleString()} (${d.deepPct.toFixed(2)}%)</b></div>
          <div class="motivation-tooltip-row"><span>Developments</span><b>${d.devs.toLocaleString()}</b></div>
        `
      })
      .on('mouseleave', () => {
        if (tooltipRef.current) tooltipRef.current.style.opacity = 0
      })
  }, [tiers])

  return (
    <div className="motivation-bars-wrap">
      <svg ref={svgRef} className="motivation-bars-svg" />
      <div ref={tooltipRef} className="motivation-tooltip" />
    </div>
  )
}

export default function MotivationPanels() {
  const [builds, setBuilds] = useState(null)
  const [error, setError] = useState(false)
  const [hoverKey, setHoverKey] = useState(null)

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

  const stats = useMemo(() => (builds ? computeStats(builds) : null), [builds])

  if (error) {
    return (
      <div className="motivation-empty">Could not load MassBuilds data.</div>
    )
  }
  if (!stats) {
    return (
      <div className="motivation-empty" aria-live="polite">Loading MassBuilds data…</div>
    )
  }

  const { breakdown, hu, tiers, devs } = stats
  const deepCount = breakdown.u30 + breakdown.a3050
  const pctDeep = (deepCount / hu) * 100

  const waffleLegend = AMI_CATS.map((c) => {
    const count = breakdown[c.key] || 0
    return { ...c, count, pct: (count / hu) * 100 }
  })

  const rapid = tiers.find((t) => t.tier === 'Rapid Transit')
  const bus = tiers.find((t) => t.tier === 'MBTA Key Bus')

  return (
    <div className="motivation-stack">
      {/* Visualization 1: Waffle chart */}
      <article className="motivation-card">
        <header className="motivation-card-header">
          <span className="motivation-eyebrow">Evidence · 01</span>
          <h3>Of every 100 new homes built near MBTA transit…</h3>
          <p className="motivation-dek">
            Across <strong>{devs.toLocaleString()}</strong> completed and in-progress developments
            near rapid transit, commuter rail, ferry, and key bus routes, the income mix of{' '}
            <strong>{hu.toLocaleString()}</strong> new units looks like this.
          </p>
        </header>

        <div className="motivation-waffle-layout">
          <WaffleChart
            breakdown={breakdown}
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
                <span className="motivation-legend-swatch" style={{ background: l.color }} />
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
          Only <strong>{pctDeep.toFixed(1)}%</strong> of new units near MBTA transit are targeted at households earning below 50% AMI.
          Those are the renters with the least ability to afford a car, and the most to gain from living near transit.
          The other <strong>{((breakdown.market / hu) * 100).toFixed(0)}%</strong> of units are market-rate.
        </div>

        <footer className="motivation-source">
          Source: MassBuilds development inventory (Mar 2026), filtered to completed &amp;
          under-construction projects tagged near MBTA Rapid Transit, Commuter Rail, Ferry, or Key Bus routes.
        </footer>
      </article>

      {/* Visualization 2: Transit-tier bars */}
      <article className="motivation-card">
        <header className="motivation-card-header">
          <span className="motivation-eyebrow">Evidence · 02</span>
          <h3>The better the transit, the less affordable the housing.</h3>
          <p className="motivation-dek">
            Sort the same developments by their primary transit service. The most frequent,
            most job-rich mode, rapid transit, produces the <em>lowest</em> share of affordable units.
            Lower-income households get pushed to bus-served areas where service is less frequent.
          </p>
        </header>

        <TransitBars tiers={tiers} />

        <div className="motivation-bars-legend">
          <span className="motivation-swatch" style={{ background: '#6b1a12' }} /> Deep affordability (&lt;50% AMI)
          <span className="motivation-swatch" style={{ background: '#DA291C' }} /> Rapid transit: any affordable
          <span className="motivation-swatch" style={{ background: '#8a9a7b' }} /> Other tiers: any affordable
        </div>

        {rapid && bus && (
          <div className="motivation-takeaway">
            Near rapid transit, just <strong>{rapid.affPct.toFixed(1)}%</strong> of new units are affordable,
            compared to <strong>{bus.affPct.toFixed(1)}%</strong> along MBTA key bus routes.
            The places with the best job access and lowest car dependence are where zoning has produced
            the most market-rate housing, not the most affordable housing.
          </div>
        )}

        <footer className="motivation-source">
          Source: MassBuilds (Mar 2026). &ldquo;Affordable&rdquo; counts deed-restricted units reported to MassBuilds;
          projects may report multiple transit types, so each is assigned to its highest-service mode.
        </footer>
      </article>
    </div>
  )
}
