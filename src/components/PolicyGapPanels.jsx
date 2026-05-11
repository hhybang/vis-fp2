import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { loadMassBuilds } from '../utils/dataLoaders'

const MBTA_MODES = ['Rapid Transit', 'Commuter Rail', 'Ferry', 'MBTA Key Bus Route']

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

/* =========================================================================
   Stats: aggregate MassBuilds into the breakdown the panels need.
   We compute (a) the overall MBTA-near unit mix in five AMI tiers + market,
   and (b) a per-municipality table for the peer/scatter context.
   ========================================================================= */

function computePolicyGapStats(builds) {
  let mbtaHu = 0,
    mbtaAff = 0,
    u30 = 0,
    a3050 = 0,
    a5080 = 0,
    a80p = 0
  let awayHu = 0,
    awayAff = 0
  for (const d of builds) {
    const modes = parseTransitModes(d.nTransit)
    const hu = d.hu || 0
    const aff = d.affrdUnit || 0
    if (isMbtaServed(modes)) {
      mbtaHu += hu
      mbtaAff += aff
      u30 += d.affU30 || 0
      a3050 += d.aff3050 || 0
      a5080 += d.aff5080 || 0
      a80p += d.aff80p || 0
    } else {
      awayHu += hu
      awayAff += aff
    }
  }
  const affOther = Math.max(0, mbtaAff - (u30 + a3050 + a5080 + a80p))
  const market = Math.max(0, mbtaHu - mbtaAff)

  // Allocate the "tier-unspecified" affordable units proportionally across
  // the four known AMI bands so the breakdown still sums to 100%.
  const knownAff = u30 + a3050 + a5080 + a80p
  const splitOther = (band) =>
    knownAff > 0 ? affOther * (band / knownAff) : 0
  const breakdown = {
    u30: u30 + splitOther(u30),
    a3050: a3050 + splitOther(a3050),
    a5080: a5080 + splitOther(a5080),
    a80p: a80p + splitOther(a80p),
    market,
  }

  // Per-municipality, MBTA-served only, for peer/scatter context.
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
    .filter((m) => m.hu >= 200)
    .map((m) => ({ ...m, affPct: m.hu > 0 ? (m.aff / m.hu) * 100 : 0 }))

  const deepCount = breakdown.u30 + breakdown.a3050
  const affCount = deepCount + breakdown.a5080 + breakdown.a80p
  return {
    funnel: {
      mbtaHu,
      mbtaAff,
      mbtaDeep: deepCount,
      affPct: mbtaHu ? (mbtaAff / mbtaHu) * 100 : 0,
      deepPct: mbtaHu ? (deepCount / mbtaHu) * 100 : 0,
      awayHu,
      awayAff,
      awayAffPct: awayHu ? (awayAff / awayHu) * 100 : 0,
    },
    breakdown,
    breakdownPct: {
      u30: mbtaHu ? (breakdown.u30 / mbtaHu) * 100 : 0,
      a3050: mbtaHu ? (breakdown.a3050 / mbtaHu) * 100 : 0,
      a5080: mbtaHu ? (breakdown.a5080 / mbtaHu) * 100 : 0,
      a80p: mbtaHu ? (breakdown.a80p / mbtaHu) * 100 : 0,
      market: mbtaHu ? (breakdown.market / mbtaHu) * 100 : 0,
    },
    munis,
    totalUnits: mbtaHu,
    affCount,
    deepCount,
  }
}

/* =========================================================================
   Counterfactual model used by the Lever Panel and Worker Picker.

   We model a stylized policy package — the same one MA peer states already
   use — as two independently toggleable levers. Each applies a simple rule
   on top of the MassBuilds pipeline breakdown.

     1. FLOOR        — at least 20% of new units must be deed-restricted.
                       Top up `affordable` by pulling from `market`.
     2. DEEP_TARGET  — half of the required affordable share must be at
                       <=50% AMI. Reallocate within the affordable pool.

   Output: a {u30, a3050, a5080, a80p, market} pct breakdown that always
   sums to ~100.
   ========================================================================= */

function applyLevers(basePct, levers) {
  const out = { ...basePct }
  const total = 100

  if (levers.floor) {
    // Bring total affordable share up to 20%. New deed-restricted share is
    // taken from market and distributed across the four affordable bands
    // in proportion to the *existing* affordable mix so low bands move too
    // (the old 60/40 50-80% vs 80%+ only split made the worker row imply
    // that higher earners "gained access" and lower earners did not).
    const floor = 20
    const aff = out.u30 + out.a3050 + out.a5080 + out.a80p
    if (aff < floor) {
      const need = floor - aff
      out.market = Math.max(0, out.market - need)
      const u0 = out.u30
      const t30 = out.a3050
      const t50 = out.a5080
      const t80 = out.a80p
      const aSum = u0 + t30 + t50 + t80
      if (aSum > 1e-6) {
        out.u30 = u0 + need * (u0 / aSum)
        out.a3050 = t30 + need * (t30 / aSum)
        out.a5080 = t50 + need * (t50 / aSum)
        out.a80p = t80 + need * (t80 / aSum)
      } else {
        const q = need / 4
        out.u30 = u0 + q
        out.a3050 = t30 + q
        out.a5080 = t50 + q
        out.a80p = t80 + q
      }
    }
  }

  if (levers.deep) {
    // Of total affordable, at least half must be <=50% AMI (deep).
    const aff = out.u30 + out.a3050 + out.a5080 + out.a80p
    const deepTarget = aff * 0.5
    const currentDeep = out.u30 + out.a3050
    if (currentDeep < deepTarget) {
      const need = deepTarget - currentDeep
      // Pull from a5080/a80p first (still affordable), then market last.
      let remaining = need
      const pullA80p = Math.min(out.a80p, remaining)
      out.a80p -= pullA80p
      remaining -= pullA80p
      const pullA5080 = Math.min(out.a5080, remaining)
      out.a5080 -= pullA5080
      remaining -= pullA5080
      if (remaining > 0) {
        const pullMkt = Math.min(out.market, remaining)
        out.market -= pullMkt
        remaining -= pullMkt
      }
      // Add to deep affordability (split 60/40 across u30, a3050)
      const added = need - remaining
      out.u30 += added * 0.4
      out.a3050 += added * 0.6
    }
  }

  // Normalize tiny float drift
  const sum = out.u30 + out.a3050 + out.a5080 + out.a80p + out.market
  if (Math.abs(sum - total) > 0.01) {
    const k = total / sum
    out.u30 *= k
    out.a3050 *= k
    out.a5080 *= k
    out.a80p *= k
    out.market *= k
  }

  return { pct: out }
}

function sumAff(p) {
  return p.u30 + p.a3050 + p.a5080 + p.a80p
}
function sumDeep(p) {
  return p.u30 + p.a3050
}

/* =========================================================================
   Shared house glyph · used by the trace-one-home grid and by the embedded
   peer-panel definitions. SVG kept inline (no external assets) so we can
   recolor cells with a CSS fill transition.
   ========================================================================= */

function HouseGlyph({ fill, stroke = '#1a1a1a' }) {
  return (
    <svg viewBox="0 0 24 24" className="primer-house" aria-hidden="true">
      <path
        d="M3 12 L12 4 L21 12 L21 21 L3 21 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <rect x="10" y="14" width="4" height="7" fill={stroke} opacity="0.55" />
    </svg>
  )
}

/* =========================================================================
   Trace one home · a focused 10-house pipeline with one cell highlighted as
   "the traced home." When the reader pulls the floor, the traced home
   flips from gray (market-rate) to brown (deed-restricted). When the deep
   lever is pulled, an extra fund-funded home appears above the grid with a
   green halo. Captions update in lockstep so the model's three steps —
   (1) baseline, (2) floor, (3) fund — read as a story, not a chart.
   ========================================================================= */

function TraceOneHome({ levers }) {
  // We always render 10 homes. Position 0 is the traced home; positions 1–9
  // are context. With the floor on, positions 0 and 1 become deed-restricted
  // (matching the 20% rule). The traced home is always the first to flip.
  const TRACED = 0
  const homes = Array.from({ length: 10 }, (_, i) => {
    const isAff = levers.floor && i < 2
    return {
      i,
      tier: isAff ? (i === 0 ? 'a3050' : 'a5080') : 'market',
      traced: i === TRACED,
    }
  })
  const colorFor = (tier) => {
    if (tier === 'a3050') return '#a14a35'
    if (tier === 'a5080') return '#d38e42'
    return '#d4d0c4'
  }

  let stepTitle = 'Today: market-rate'
  let stepBody = (
    <>
      Without the levers, the traced home is one of the gray ones — a{' '}
      <strong>market-rate</strong> unit with no price cap. The pipeline
      delivers it at whatever rent the market bears.
    </>
  )
  if (levers.floor && !levers.deep) {
    stepTitle = 'Floor pulled: 1 in 5 must be deed-restricted'
    stepBody = (
      <>
        The 20% floor pulls 2 of every 10 new homes out of market-rate. The
        traced home <strong>flipped to deed-restricted</strong> — capped
        below market and held there for 30+ years.
      </>
    )
  } else if (levers.deep && !levers.floor) {
    stepTitle = 'Fund pulled: an extra deeply-affordable home appears'
    stepBody = (
      <>
        Every market-rate unit pays{' '}
        ~${(FEE_PER_NONAFF_UNIT / 1000).toFixed(0)}k into a local fund. Stacked
        with LIHTC at ~${(FUND_COST_PER_AFF_UNIT / 1000).toFixed(0)}k per
        affordable unit, that fee builds an{' '}
        <strong>extra home on top</strong> — priced for a household under 50%
        AMI. The traced home is still market-rate without the floor on.
      </>
    )
  } else if (levers.floor && levers.deep) {
    stepTitle = 'Both pulled: traced home flips, plus a funded extra'
    stepBody = (
      <>
        The traced home is now deed-restricted on-site, and the fund builds
        an <strong>extra deeply-affordable home</strong> on top of the
        pipeline — the bulk of fund-funded units land at &le;50% AMI.
      </>
    )
  }

  const showFundedExtra = levers.deep
  const tracedTier = homes[TRACED].tier

  return (
    <div className="trace-home" aria-label="Trace one home through the policy package">
      <div className="trace-home-header">
        <span className="trace-home-title">{stepTitle}</span>
      </div>

      <div className="trace-home-stage">
        {/* Funded-extra row sits above the main grid; it's empty until deep
            is on, then a single haloed home glyph slides in. */}
        <div
          className={`trace-home-extra-row${showFundedExtra ? ' is-on' : ''}`}
          aria-hidden={!showFundedExtra}
        >
          <div className="trace-home-extra-cell">
            {showFundedExtra && (
              <>
                <span className="trace-home-extra-halo" />
                <HouseGlyph fill="#4d5a3f" stroke="#3d4732" />
                <span className="trace-home-extra-label">+1 funded by fund</span>
              </>
            )}
          </div>
        </div>

        <div className="trace-home-grid">
          {homes.map((h) => (
            <div
              key={h.i}
              className={`trace-home-cell${h.traced ? ' is-traced' : ''}`}
              data-tier={h.tier}
            >
              <HouseGlyph fill={colorFor(h.tier)} />
              {h.traced && (
                <span
                  className={`trace-home-marker trace-home-marker--${tracedTier === 'market' ? 'market' : 'aff'}`}
                  aria-label="Traced home"
                >
                  this one
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="trace-home-caption" aria-live="polite">{stepBody}</p>
    </div>
  )
}

/* =========================================================================
   Viz A · The Lever Rack
   --------------------------------------------------------------------------
   Two policy toggles. As readers flip them, the stack transforms in real
   time and worker icons show who gains a larger share of the mix.
   ========================================================================= */

const TIERS = [
  { key: 'u30', label: 'Very low income', sub: '<30% AMI', color: '#6b2b27' },
  { key: 'a3050', label: 'Low income', sub: '30–50% AMI', color: '#a14a35' },
  { key: 'a5080', label: 'Moderate', sub: '50–80% AMI', color: '#d38e42' },
  { key: 'a80p', label: 'Workforce', sub: '80%+ AMI', color: '#e9c46a' },
  { key: 'market', label: 'Market-rate', sub: 'no cap', color: '#d4d0c4' },
]

const LEVERS = [
  {
    id: 'floor',
    title: '20% inclusionary floor',
    desc: 'Every TOD project reserves \u226520% as deed-restricted.',
    peer: 'CA SB\u00a035',
  },
  {
    id: 'deep',
    title: 'Mandatory share + housing fund',
    desc: 'Each market-rate unit pays an in-lieu fee into a city housing fund; the fund builds extra units at ≤50% AMI.',
    peer: 'Seattle MHA · WA HB 1491',
  },
]

// Stylized worker income points (BLS Boston MSA medians, 2-person AMI base).
// Used by both the Lever Rack (which workers light up) and the Worker Picker.
const BOSTON_AMI_100_2P = 127200
const WORKERS = [
  { name: 'Retail salesperson', wage: 36170, icon: '🛍️' },
  { name: 'Preschool teacher', wage: 45300, icon: '✏️' },
  { name: 'Firefighter', wage: 75050, icon: '🚒' },
  { name: 'Software engineer', wage: 135300, icon: '💻' },
].map((w) => ({ ...w, ami: (w.wage / BOSTON_AMI_100_2P) * 100 }))

function workerTier(ami) {
  if (ami < 30) return 'u30'
  if (ami < 50) return 'a3050'
  if (ami < 80) return 'a5080'
  return 'a80p'
}
// Unit tiers a worker can realistically secure. Below 80% AMI: cumulative
// access to deed-restricted lotteries at her tier and below (market is out of
// reach). At 80%+ AMI: she ages out of low-income set-asides — what the
// pipeline actually offers her is the workforce (80%+) slice plus the entire
// market-rate stock she can now afford at list price.
function tiersAccessibleTo(ami) {
  if (ami < 30) return new Set(['u30'])
  if (ami < 50) return new Set(['u30', 'a3050'])
  if (ami < 80) return new Set(['u30', 'a3050', 'a5080'])
  return new Set(['a80p', 'market'])
}

// For the lever “who gains” read: do not sum the whole <80% left stack for
// high earners (they are not in the running for very low-income set-asides).
// Under-50% AMI: deep bands only. 50–80%: through moderate. 80+%: workforce
// (80%+) set-aside slice only.
function tiersNarrativeAccess(ami) {
  if (ami < 50) return new Set(['u30', 'a3050'])
  if (ami < 80) return new Set(['u30', 'a3050', 'a5080'])
  return new Set(['a80p'])
}

/* --------------------------------------------------------------------------
   ScoreboardChart — single merged stacked-area chart that replaces the old
   PipelineAreaChart + FundProjectionChart pair. Bottom four bands are the
   on-site affordable mix produced by the inclusionary floor (CA-style),
   broken out by AMI tier. The top band is the additional affordable
   production funded by the in-lieu fund (Seattle-style). One Y-axis,
   cumulative affordable homes; the dollar total appears as an inline
   annotation. The whole chart is the prescription's scoreboard — pull the
   levers and the bands grow off the bottom.
   -------------------------------------------------------------------------- */

const HORIZON_YEARS = 10
const AFFORDABLE_KEYS = ['u30', 'a3050', 'a5080', 'a80p']
const FUND_KEY = 'fund'
const FUND_COLOR = '#4d5a3f' // deep green — echoes the peer chart's "what other places do" accent

// Calibration constants for the in-lieu-fund layer. All three are
// public-record-anchored figures; full citations are in the chart footnote.
const FEE_PER_NONAFF_UNIT = 20000        // $ collected per market-rate unit (Seattle MHA empirical avg, area-weighted)
const FUND_COST_PER_AFF_UNIT = 200000    // local fund $ per affordable unit produced (Boston construction basis, LIHTC-stacked)
const NONAFF_SHARE_AFTER_FLOOR = 0.80    // share of pipeline still market-rate after the 20% inclusionary floor

function fundProjectionNumbers(totalUnits, fundActive) {
  const nonAffUnitsTotal = fundActive ? totalUnits * NONAFF_SHARE_AFTER_FLOOR : 0
  const fundTotal = nonAffUnitsTotal * FEE_PER_NONAFF_UNIT
  const fundedAffUnitsTotal = fundTotal / FUND_COST_PER_AFF_UNIT
  return {
    nonAffUnitsTotal,
    fundTotal,
    fundedAffUnitsTotal,
  }
}

function ScoreboardChart({ pct, totalUnits, levers }) {
  const ref = useRef(null)
  const numLevers = (levers.floor ? 1 : 0) + (levers.deep ? 1 : 0)
  const fundActive = levers.deep

  const numbers = useMemo(() => {
    const onSiteAffPct = pct.u30 + pct.a3050 + pct.a5080 + pct.a80p
    const onSiteDeepPct = pct.u30 + pct.a3050
    const onSiteAff = (onSiteAffPct / 100) * totalUnits
    const onSiteDeep = (onSiteDeepPct / 100) * totalUnits
    const fund = fundProjectionNumbers(totalUnits, fundActive)
    return {
      onSiteAff,
      onSiteDeep,
      fundTotal: fund.fundTotal,
      fundedAff: fund.fundedAffUnitsTotal,
      nonAffUnitsTotal: fund.nonAffUnitsTotal,
      totalAff: onSiteAff + fund.fundedAffUnitsTotal,
      // Fund-funded units stack the LIHTC at <=50% AMI, so they count as
      // deeply affordable in the headline.
      totalDeep: onSiteDeep + fund.fundedAffUnitsTotal,
    }
  }, [pct, totalUnits, fundActive])

  useEffect(() => {
    const draw = (svgEl) => {
      if (!svgEl) return
      const svg = d3.select(svgEl)
      svg.selectAll('*').remove()

      const bbox = svgEl.getBoundingClientRect()
      const W = Math.max(280, bbox.width || 480)
      const H = 260
      const margin = { top: 14, right: 18, bottom: 32, left: 50 }
      const innerW = W - margin.left - margin.right
      const innerH = H - margin.top - margin.bottom

      svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'none')

      const g = svg
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      // Build per-year stacked rows: 4 AMI bands on the bottom, the fund
      // layer on top. With both levers off, every band is 0 and the chart
      // is empty — the prescription literally builds nothing without the
      // levers pulled.
      const annualUnits = totalUnits / HORIZON_YEARS
      const data = Array.from({ length: HORIZON_YEARS + 1 }, (_, year) => {
        const cumulative = annualUnits * year
        const row = { year }
        AFFORDABLE_KEYS.forEach((k) => {
          row[k] = (cumulative * (pct[k] || 0)) / 100
        })
        row[FUND_KEY] = fundActive
          ? (cumulative * NONAFF_SHARE_AFTER_FLOOR * FEE_PER_NONAFF_UNIT) /
            FUND_COST_PER_AFF_UNIT
          : 0
        return row
      })

      // Fix the Y ceiling to ~40% of pipeline so toggling levers grows the
      // bands within a stable frame instead of rescaling the chart.
      const yMax = Math.max(totalUnits * 0.4, 1)

      const x = d3.scaleLinear().domain([0, HORIZON_YEARS]).range([0, innerW])
      const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0])

      const stackKeys = [...AFFORDABLE_KEYS, FUND_KEY]
      const stack = d3.stack().keys(stackKeys)
      const series = stack(data)

      const tierColor = Object.fromEntries(TIERS.map((t) => [t.key, t.color]))
      const colorFor = (k) => (k === FUND_KEY ? FUND_COLOR : tierColor[k])

      const area = d3
        .area()
        .x((d) => x(d.data.year))
        .y0((d) => y(d[0]))
        .y1((d) => y(d[1]))
        .curve(d3.curveMonotoneX)

      g.append('g')
        .selectAll('path')
        .data(series)
        .enter()
        .append('path')
        .attr('fill', (d) => colorFor(d.key))
        .attr('opacity', (d) => (d.key === FUND_KEY ? 0.78 : 0.92))
        .attr('d', area)

      // Subtle horizontal grid
      g.append('g')
        .selectAll('line')
        .data(y.ticks(4))
        .enter()
        .append('line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', (d) => y(d))
        .attr('y2', (d) => y(d))
        .attr('stroke', '#e8e3d2')
        .attr('stroke-width', 1)

      // Endpoint label: total cumulative at year 10
      const lastTop = series[series.length - 1][HORIZON_YEARS][1]
      if (lastTop > 0) {
        g.append('line')
          .attr('x1', x(HORIZON_YEARS))
          .attr('x2', x(HORIZON_YEARS))
          .attr('y1', y(lastTop))
          .attr('y2', y(lastTop) - 8)
          .attr('stroke', '#1a1a1a')
          .attr('stroke-width', 1)
        g.append('text')
          .attr('x', x(HORIZON_YEARS))
          .attr('y', y(lastTop) - 12)
          .attr('text-anchor', 'end')
          .attr('font-family', 'DM Sans, Inter, sans-serif')
          .attr('font-size', 10.5)
          .attr('font-weight', 600)
          .attr('fill', '#1a1a1a')
          .text(`${Math.round(lastTop).toLocaleString()} homes`)
      }

      g.append('g')
        .attr('transform', `translate(0, ${innerH})`)
        .call(
          d3
            .axisBottom(x)
            .ticks(5)
            .tickFormat((d) => (d === 0 ? 'now' : `+${d}y`))
        )
        .call((sel) => {
          sel.selectAll('text')
            .attr('font-family', 'DM Sans, Inter, sans-serif')
            .attr('font-size', 10)
            .attr('fill', '#6e6e6e')
          sel.selectAll('line').attr('stroke', '#cdc7b4')
          sel.select('.domain').attr('stroke', '#cdc7b4')
        })

      g.append('g')
        .call(
          d3
            .axisLeft(y)
            .ticks(4)
            .tickFormat((d) => (d >= 1000 ? `${(d / 1000).toFixed(1)}k` : d))
        )
        .call((sel) => {
          sel.selectAll('text')
            .attr('font-family', 'DM Sans, Inter, sans-serif')
            .attr('font-size', 10)
            .attr('fill', '#6e6e6e')
          sel.selectAll('line').attr('stroke', '#cdc7b4')
          sel.select('.domain').attr('stroke', '#cdc7b4')
        })

      svg
        .append('text')
        .attr('x', 6)
        .attr('y', 12)
        .attr('font-family', 'DM Sans, Inter, sans-serif')
        .attr('font-size', 9.5)
        .attr('font-weight', 700)
        .attr('letter-spacing', '0.06em')
        .attr('text-transform', 'uppercase')
        .attr('fill', '#6e6e6e')
        .text('Cumulative affordable homes near the MBTA')
    }

    draw(ref.current)
    const onResize = () => draw(ref.current)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pct, totalUnits, fundActive])

  const totalAff = Math.round(numbers.totalAff)
  const totalDeep = Math.round(numbers.totalDeep)
  const fundedAff = Math.round(numbers.fundedAff)

  const eyebrow = (() => {
    if (numLevers === 0) return 'No levers pulled · the prescription does nothing'
    if (numLevers === 1 && levers.floor) return 'Inclusionary floor only · 1 lever pulled'
    if (numLevers === 1 && levers.deep) return 'Mandatory share + fund only · 1 lever pulled'
    return 'Both levers pulled · CA floor + Seattle fund'
  })()

  return (
    <figure className="scoreboard-chart">
      <figcaption className="scoreboard-cap">
        <span className="scoreboard-eyebrow">{eyebrow}</span>
        <span className="scoreboard-headline">
          {totalAff.toLocaleString()} affordable homes
          <span className="scoreboard-headline-tail">
            &nbsp;in 10 years
          </span>
        </span>
        <span className="scoreboard-subline">
          {totalDeep.toLocaleString()} deeply affordable (&le;50% AMI)
          {fundActive && fundedAff > 0 ? (
            <>
              {' '}&middot; of which <strong>{fundedAff.toLocaleString()}</strong> funded by{' '}
              <strong>${(numbers.fundTotal / 1e6).toFixed(0)}M</strong> in in-lieu fees
            </>
          ) : null}
        </span>
      </figcaption>
      <svg ref={ref} className="scoreboard-svg" />
      <details className="scoreboard-foot">
        <summary>Sources &amp; absorption note</summary>
        <p>
          Pipeline modeled as{' '}
          <strong>{totalUnits.toLocaleString()}</strong> MBTA-near units over
          a ten-year linear absorption. Lever parameters (20% on-site floor,
          ${(FEE_PER_NONAFF_UNIT / 1000).toFixed(0)}k per-unit fee,
          ${(FUND_COST_PER_AFF_UNIT / 1000).toFixed(0)}k LIHTC-stacked cost)
          are sourced from each peer&rsquo;s panel above.{' '}
          <strong>Sources:</strong>{' '}
          <a
            href="https://www.seattle.gov/housing/housing-developers/mandatory-housing-affordability/mha-annual-reports"
            target="_blank"
            rel="noopener noreferrer"
          >
            Seattle Office of Housing &mdash; MHA Annual Reports (2019&ndash;2023)
          </a>
          ;{' '}
          <a
            href="https://ternercenter.berkeley.edu/research-and-policy/inclusionary-zoning-2023/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terner Center &mdash; Inclusionary Zoning fee studies
          </a>
          ;{' '}
          <a
            href="https://www.huduser.gov/portal/datasets/lihtc.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            HUD LIHTC database
          </a>
          ;{' '}
          <a
            href="https://www.mhp.net/news/2023/the-cost-of-building-in-massachusetts"
            target="_blank"
            rel="noopener noreferrer"
          >
            MHP &mdash; Cost of Building in Massachusetts
          </a>
          .
        </p>
      </details>
    </figure>
  )
}

function LeverPanel({ basePct, totalUnits }) {
  const [levers, setLevers] = useState({ floor: false, deep: false })
  const result = useMemo(() => applyLevers(basePct, levers), [basePct, levers])
  const baseNorm = useMemo(
    () => applyLevers(basePct, { floor: false, deep: false }),
    [basePct]
  )
  const rWithoutDeep = useMemo(
    () => applyLevers(basePct, { floor: levers.floor, deep: false }),
    [basePct, levers.floor]
  )
  const dAffFromFloor = levers.floor
    ? sumAff(rWithoutDeep.pct) - sumAff(baseNorm.pct)
    : 0
  const dDeepFromDeep = levers.deep
    ? sumDeep(result.pct) - sumDeep(rWithoutDeep.pct)
    : 0

  const toggle = (id) => setLevers((s) => ({ ...s, [id]: !s[id] }))
  const reset = () => setLevers({ floor: false, deep: false })
  const enableAll = () => setLevers({ floor: true, deep: true })

  // "Gain" = +≥1pp in the deed-restricted bands that match this wage (narrative).
  const baseAccess = (w) => {
    const tiers = tiersNarrativeAccess(w.ami)
    let s = 0
    for (const t of tiers) s += basePct[t] || 0
    return s
  }
  const newAccess = (w) => {
    const tiers = tiersNarrativeAccess(w.ami)
    let s = 0
    for (const t of tiers) s += result.pct[t] || 0
    return s
  }
  const workersLitUp = WORKERS.filter((w) => newAccess(w) - baseAccess(w) >= 1)
  const numLevers = Object.values(levers).filter(Boolean).length

  return (
    <div className="lever-panel">
      <div className="lever-rack" role="group" aria-label="Policy levers">
        {LEVERS.map((lv, i) => {
          const on = levers[lv.id]
          return (
            <button
              key={lv.id}
              type="button"
              className={`lever ${on ? 'lever-on' : ''}`}
              aria-pressed={on}
              aria-label={`${lv.peer} lever: ${on ? 'pulled' : 'up'} — click to ${on ? 'release' : 'pull'}`}
              onClick={() => toggle(lv.id)}
            >
              {/* "pull me" hint on each lever — CSS hides them the
                  moment any lever in the rack flips on. */}
              <span className="lever-pullme" aria-hidden="true">
                pull me <span className="lever-pullme-arrow">&darr;</span>
              </span>
              <svg
                viewBox="0 0 80 80"
                className="lever-svg"
                aria-hidden="true"
              >
                {/* ground rail */}
                <line
                  x1="4"
                  y1="74"
                  x2="40"
                  y2="74"
                  stroke="#3d4732"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
                {/* fulcrum base — wider on the bottom, pivot at the top center */}
                <polygon points="8,74 36,74 32,64 12,64" fill="#3d4732" />
                {/* pivot bolt */}
                <circle cx="22" cy="64" r="3.25" fill="#1a1a1a" />
                {/* arm group — pivot at the local origin, translated to (22,64).
                    The viewBox is wide enough on the right (≈58 units) so the
                    arm doesn't clip when rotated up to 80°. */}
                <g transform="translate(22 64)">
                  <g className="lever-arm">
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="-42"
                      stroke="#5a5346"
                      strokeWidth="5"
                      strokeLinecap="round"
                      className="lever-arm-shaft"
                    />
                    <circle
                      cx="0"
                      cy="-42"
                      r="6.5"
                      fill="#fffaee"
                      stroke="#3d4732"
                      strokeWidth="2"
                      className="lever-arm-knob"
                    />
                    <circle
                      cx="0"
                      cy="-42"
                      r="2"
                      fill="#3d4732"
                      className="lever-arm-knob-dot"
                    />
                  </g>
                </g>
              </svg>
              <div className="lever-text">
                <div className="lever-title">{lv.title}</div>
                <div className="lever-desc">
                  {lv.desc}{' '}
                  <span className="lever-peer">&middot; {lv.peer}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="lever-controls">
        <button type="button" className="lever-mini" onClick={reset} disabled={numLevers === 0}>
          Reset
        </button>
        <button type="button" className="lever-mini lever-mini-primary" onClick={enableAll} disabled={numLevers === 2}>
          Pull both
        </button>
      </div>

      <TraceOneHome levers={levers} />

      <div className="lever-output" aria-describedby="lever-legend-captions">
        <ScoreboardChart
          pct={result.pct}
          totalUnits={totalUnits}
          levers={levers}
        />

        <div className="lever-bar-legend">
          {TIERS.filter((t) => t.key !== 'market').map((t) => (
            <span key={t.key} className="lever-legend-item">
              <span className="lever-legend-swatch" style={{ background: t.color }} />
              {t.label}
              <span className="lever-legend-sub"> · {t.sub}</span>
            </span>
          ))}
          <span className="lever-legend-item">
            <span className="lever-legend-swatch" style={{ background: FUND_COLOR }} />
            Fund-funded
            <span className="lever-legend-sub"> · Seattle in-lieu, LIHTC-stacked</span>
          </span>
        </div>

        {numLevers > 0 && (
          <details className="lever-sidenotes-details">
            <summary>What each lever is doing in the model</summary>
            <ul className="lever-sidenotes" aria-label="Model notes for your selection">
              {levers.floor && (
                <li>
                  {Math.abs(dAffFromFloor) < 0.1
                    ? 'Affordability floor: the modeled pipeline is already at or above a 20% deed-restricted share, so the bottom four bands may barely move. Where the share is under 20%, the floor pulls the difference out of the market segment.'
                    : `Affordability floor: +${dAffFromFloor.toFixed(1)} pp toward deed-restricted, from market, split across the four affordable bands in proportion to the current mix.`}
                </li>
              )}
              {levers.deep && (
                <li>
                  Mandatory share + fund: every market-rate unit pays{' '}
                  ~${(FEE_PER_NONAFF_UNIT / 1000).toFixed(0)}k into the local
                  housing fund, which stacks with LIHTC + state credits at{' '}
                  ~${(FUND_COST_PER_AFF_UNIT / 1000).toFixed(0)}k per
                  affordable unit. That funded production lands at &le;50% AMI
                  &mdash; the green band on top.
                  {Math.abs(dDeepFromDeep) >= 0.1
                    ? ` On-site, the deep bands also move +${dDeepFromDeep.toFixed(1)} pp toward <50% AMI as the floor's mix re-balances.`
                    : ''}
                </li>
              )}
            </ul>
          </details>
        )}

      </div>
    </div>
  )
}

/* =========================================================================
   Viz B · The Worker Picker
   --------------------------------------------------------------------------
   Pick one of a handful of representative Greater Boston occupations. A grid of 100 little "houses"
   recolors live to show: under today's law, how many of every 100 new MBTA-
   near homes are priced for her — and how that changes if MA adds a 20%
   inclusionary floor at 50% AMI. Designed for empathy: the abstract policy
   gap becomes "Maria can compete for 6 homes today, 32 with the floor."
   ========================================================================= */

function buildHouseLayout(pct) {
  // Allocate 100 cells to the five tiers using largest-remainder; preserve
  // tiny slivers (deep affordability) so they don't round to zero.
  const order = ['u30', 'a3050', 'a5080', 'a80p', 'market']
  const raw = order.map((k) => ({ key: k, exact: pct[k] || 0 }))
  const withFloor = raw.map((r) => ({
    ...r,
    floor: Math.floor(r.exact),
    frac: r.exact - Math.floor(r.exact),
  }))
  // Guarantee at least 1 cell to deep tiers if any exist
  for (const r of withFloor) {
    if ((r.key === 'u30' || r.key === 'a3050') && r.exact > 0 && r.floor === 0) {
      r.floor = 1
    }
  }
  let assigned = withFloor.reduce((s, r) => s + r.floor, 0)
  if (assigned < 100) {
    const remainders = withFloor
      .map((r, i) => ({ i, frac: r.frac }))
      .sort((a, b) => b.frac - a.frac)
    let j = 0
    while (assigned < 100 && j < remainders.length * 4) {
      withFloor[remainders[j % remainders.length].i].floor += 1
      assigned += 1
      j += 1
    }
  } else if (assigned > 100) {
    const marketIdx = withFloor.findIndex((r) => r.key === 'market')
    while (assigned > 100 && marketIdx >= 0 && withFloor[marketIdx].floor > 0) {
      withFloor[marketIdx].floor -= 1
      assigned -= 1
    }
  }
  // Flatten with a deterministic order so the same cell positions move
  // smoothly between Today / With-floor states.
  const flat = []
  for (const seg of withFloor) {
    for (let i = 0; i < seg.floor; i++) flat.push(seg.key)
  }
  while (flat.length < 100) flat.push('market')
  return flat.slice(0, 100)
}

function WorkerPicker({ basePct, totalUnits }) {
  const [selected, setSelected] = useState('Preschool teacher')

  const worker = WORKERS.find((w) => w.name === selected) || WORKERS[1]
  const tiers = tiersAccessibleTo(worker.ami)
  const accessibleTier = workerTier(worker.ami)

  const houses = useMemo(() => buildHouseLayout(basePct), [basePct])

  // Per-100 count she can compete for under today's policy.
  const nowCount = houses.filter((k) => tiers.has(k)).length
  const realNow = Math.round((nowCount / 100) * totalUnits)

  return (
    <div className="worker-picker">
      <div className="worker-chip-row" role="radiogroup" aria-label="Pick a worker">
        {WORKERS.map((w) => {
          const isOn = w.name === selected
          return (
            <button
              key={w.name}
              type="button"
              role="radio"
              aria-checked={isOn}
              className={`worker-chip ${isOn ? 'worker-chip-on' : ''}`}
              onClick={() => setSelected(w.name)}
            >
              <span className="worker-chip-icon" aria-hidden="true">{w.icon}</span>
              <span className="worker-chip-text">
                <span className="worker-chip-name">{w.name}</span>
                <span className="worker-chip-wage">${(w.wage / 1000).toFixed(0)}k · {w.ami.toFixed(0)}% AMI</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="worker-picker-board">
        <div className="worker-picker-headline">
          <div className="worker-picker-name">
            <span className="worker-picker-icon" aria-hidden="true">{worker.icon}</span>
            <div>
              <div className="worker-picker-title">{worker.name}</div>
              <div className="worker-picker-subtitle">
                Median wage <strong>${worker.wage.toLocaleString()}</strong> · {worker.ami.toFixed(0)}% of Boston AMI ·
                fits in <span style={{ color: TIERS.find((t) => t.key === accessibleTier).color, fontWeight: 800 }}>
                  {TIERS.find((t) => t.key === accessibleTier).label}
                </span> tier and below
              </div>
            </div>
          </div>

        </div>

        <div className="worker-picker-layout">
          <div className="worker-house-grid" aria-label="100 representative homes built near MBTA">
            {houses.map((tier, i) => {
              const accessible = tiers.has(tier)
              const tierMeta = TIERS.find((t) => t.key === tier)
              return (
                <div
                  key={i}
                  className={`worker-house ${accessible ? 'worker-house-on' : ''}`}
                  style={{
                    background: accessible ? tierMeta.color : 'transparent',
                    borderColor: accessible ? tierMeta.color : '#d4d0c4',
                    transitionDelay: `${(i % 10) * 14 + Math.floor(i / 10) * 6}ms`,
                  }}
                  title={`${tierMeta.label}${accessible ? ' (priced for ' + worker.name + ')' : ' (out of reach)'}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 3 L2 13 L5 13 L5 22 L19 22 L19 13 L22 13 Z"
                      fill={accessible ? '#fffaee' : '#d4d0c4'}
                    />
                  </svg>
                </div>
              )
            })}
          </div>

          <div className="worker-callout">
            <div className="worker-callout-row">
              <div className="worker-callout-eyebrow">Of every 100 new homes near MBTA</div>
              <div className="worker-callout-num">
                <span className="worker-callout-now is-active">{nowCount}</span>
              </div>
              <div className="worker-callout-sub">
                priced for a {worker.name.toLowerCase()}
              </div>
            </div>

            <div className="worker-callout-row worker-callout-real">
              <div className="worker-callout-eyebrow">In real units already in the MBTA-near pipeline</div>
              <div className="worker-callout-real-row">
                <span>{realNow.toLocaleString()}</span>
              </div>
              <div className="worker-callout-delta">
                homes a {worker.name.toLowerCase()} can currently compete for
              </div>
            </div>

            <div className="worker-callout-foot">
              {worker.ami >= 80 ? (
                <>
                  The accessible homes (colored) are the workforce (80%+ AMI) set-asides she
                  qualifies for, plus market-rate units she can rent at list price. The
                  remaining homes are deeper-affordable lottery slots reserved for
                  lower-income tiers.
                </>
              ) : (
                <>
                  The accessible homes (colored) are the only units a {worker.name.toLowerCase()}
                  {' '}can win in a housing lottery near a T stop. The rest are priced above
                  her income tier.
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   Viz C · Peer comparison: what other jurisdictions require near transit
   ========================================================================= */

const PEER_POLICIES = [
  {
    key: 'ca',
    step: 1,
    definitionKind: 'floor',
    place: 'California',
    policy: 'SB 35 Streamlining',
    policyShort: 'SB 35',
    policyUrl:
      'https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=201720180SB35',
    year: 2017,
    floor: 20,
    floorLabel: '20% required (Bay Area)',
    barLabel: '20%',
    accent: '#4d5a3f',
    isFocus: false,
    pieces: {
      zoning: { has: true, label: 'By-right TOD zoning', detail: '≤90-day ministerial approval' },
      floor: { has: true, label: 'Affordability floor', detail: '20% deed-restricted, half ≤50% AMI' },
    },
    stats: [
      { num: '20%', unit: '', label: 'Bay Area required share' },
      { num: '≤90', unit: 'days', label: 'approval timeline' },
      { num: '18,000', unit: '+', label: 'homes streamlined (mostly 100% aff.)' },
    ],
    description:
      'Joins by-right approval near transit with a statewide affordability requirement. Qualifying projects in jurisdictions behind on their housing targets skip discretionary review and CEQA — but only if they hit the law\u2019s required deed-restricted share.',
    sources: [
      { label: 'Cal. Gov. Code §65913.4', url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=65913.4' },
      { label: 'Terner Center evaluation', url: 'https://ternercenter.berkeley.edu/research-and-policy/sb-35-evaluation/' },
    ],
  },
  {
    key: 'sea',
    step: 2,
    definitionKind: 'ami',
    place: 'Seattle, WA',
    policy: 'Mandatory Housing Affordability',
    policyShort: 'MHA',
    policyUrl: 'https://www.seattle.gov/housing/housing-developers/mandatory-housing-affordability',
    year: 2019,
    floor: 9,
    floorLabel: '5–11% required',
    barLabel: '5–11%',
    accent: '#4d5a3f',
    isFocus: false,
    pieces: {
      zoning: { has: true, label: 'By-right upzoning', detail: 'Urban centers and station areas' },
      floor: { has: true, label: 'Affordability floor', detail: '5–11% on every multifamily project' },
    },
    stats: [
      { num: '5–11%', unit: '', label: 'required share (or in-lieu fee)' },
      { num: '$280M', unit: '+', label: 'fees collected through 2023' },
      { num: '~3,800', unit: '', label: 'affordable units built or funded' },
    ],
    description:
      'Pairs upzoning with a mandatory share rule: every new multifamily project must build affordable units or pay into a city affordable-housing fund. The closest peer in design to what an MBTA-Communities-plus-floor would look like \u2014 and in 2025 Washington took it statewide with HB 1491, requiring affordable units in every TOD across the state.',
    sources: [
      { label: 'Seattle Office of Housing', url: 'https://www.seattle.gov/housing/housing-developers/mandatory-housing-affordability' },
      { label: 'Washington HB 1491 (2025 statewide TOD law)', url: 'https://app.leg.wa.gov/billsummary?BillNumber=1491&Year=2025' },
    ],
  },
  {
    key: 'ma',
    step: 3,
    definitionKind: 'gap',
    place: 'Massachusetts',
    policy: 'MBTA Communities Act',
    policyShort: 'MA today',
    policyUrl: 'https://www.mass.gov/info-details/multi-family-zoning-requirement-for-mbta-communities',
    year: 2021,
    floor: 0,
    floorLabel: 'No floor',
    barLabel: 'No floor',
    accent: '#DA291C',
    isFocus: true,
    usesRealized: true,
    pieces: {
      zoning: { has: true, label: 'By-right TOD zoning', detail: 'MBTA Communities Act' },
      floor: { has: false, label: 'No statewide floor', detail: 'Cities can require at most ~10% affordable, and only for moderate-income (80% AMI) renters' },
    },
    stats: [
      { num: '0%', unit: '', label: 'required affordable share' },
      { num: '177', unit: '', label: 'communities subject to the law' },
      { num: 'TBD', unit: '%', label: 'actual share being built (no requirement)', dynamic: 'affPctRealized' },
    ],
    description:
      'Zones for density near transit but sets no statewide affordability requirement. Local inclusionary ordinances above 10% at 80% AMI risk losing their as-of-right status, so a community can comply by zoning a district of entirely market-rate towers.',
    sources: [
      { label: 'Mass.gov MBTA Communities', url: 'https://www.mass.gov/info-details/multi-family-zoning-requirement-for-mbta-communities' },
      { label: 'MAPC Section 3A analysis', url: 'https://www.mapc.org/planning101/affordability-effectiveness-section-3a/' },
    ],
  },
]

/* =========================================================================
   Peer stepper · three CSS-styled step cards in a horizontal row, with
   integrated Back/Next nav. Replaces the d3 chart: the comparison data
   lives inline (a tiny bar inside each card) so the cards both *show* the
   sequence and *control* it, freeing the panel below to take full width.
   ========================================================================= */

const STEPPER_BAR_MAX = 25 // shared scale across all three cards (%)

function PeerStepperCard({ peer, isActive, funnel }) {
  const realized = peer.usesRealized ? funnel.affPct : null
  const fillPct = Math.min(100, (peer.floor / STEPPER_BAR_MAX) * 100)
  const realizedPct =
    realized != null ? Math.min(100, (realized / STEPPER_BAR_MAX) * 100) : null
  return (
    <li
      className={`peer-stepper-card${isActive ? ' is-active' : ''}${peer.isFocus ? ' is-focus' : ''}`}
      style={{ '--card-accent': peer.accent }}
      aria-current={isActive ? 'step' : undefined}
    >
      <div className="peer-stepper-card-head">
        <span className="peer-stepper-badge" aria-hidden="true">{peer.step}</span>
        <div className="peer-stepper-place-block">
          <div className="peer-stepper-place">{peer.place}</div>
          <div className="peer-stepper-policy">
            {peer.policyShort} · {peer.year}
          </div>
        </div>
      </div>

      <div className="peer-stepper-bar" aria-hidden="true">
        <div className="peer-stepper-bar-track">
          {peer.floor > 0 && (
            <div
              className="peer-stepper-bar-fill"
              style={{ width: `${fillPct}%`, background: peer.accent }}
            />
          )}
          {realizedPct != null && (
            <div
              className="peer-stepper-bar-diamond"
              style={{ left: `${realizedPct}%` }}
              title={`Actually built today: ${realized.toFixed(1)}%`}
            />
          )}
        </div>
      </div>

      <div className="peer-stepper-bar-foot">
        <span
          className={`peer-stepper-barlabel${peer.floor === 0 ? ' peer-stepper-barlabel-empty' : ''}`}
          style={peer.floor > 0 ? { color: peer.accent } : undefined}
        >
          {peer.floor > 0
            ? `${peer.barLabel} must be affordable`
            : `${peer.barLabel} required`}
        </span>
        {realized != null && (
          <span className="peer-stepper-bar-realized">
            <span className="peer-stepper-bar-diamond-mini" aria-hidden="true" />
            {realized.toFixed(1)}% built
          </span>
        )}
      </div>
    </li>
  )
}

function PeerStepper({ peers, activeKey, funnel, prevPeer, nextPeer, onSelect, termLabel }) {
  return (
    <div className="peer-stepper" aria-label="Three peer policies">
      <p className="peer-stepper-subtitle">
        Each bar = the share of new homes near transit that must be set aside
        as affordable (deed-restricted, priced below market for 30+ years).
      </p>
      <ol className="peer-stepper-list" role="list">
        {peers.map((p) => (
          <PeerStepperCard
            key={p.key}
            peer={p}
            isActive={p.key === activeKey}
            funnel={funnel}
          />
        ))}
      </ol>

      <nav className="peer-stepper-nav" aria-label="Walk through the three peers">
        <button
          type="button"
          className="peer-stepper-nav-btn"
          onClick={() => prevPeer && onSelect(prevPeer.key)}
          disabled={!prevPeer}
          aria-label={prevPeer ? `Back to step ${prevPeer.step}: ${prevPeer.place}` : 'No previous step'}
        >
          <span aria-hidden="true">&larr;</span> Back
        </button>
        <div className="peer-stepper-nav-label">
          <span className="peer-stepper-nav-term">{termLabel}</span>
        </div>
        <button
          type="button"
          className="peer-stepper-nav-btn peer-stepper-nav-btn-next"
          onClick={() => nextPeer && onSelect(nextPeer.key)}
          disabled={!nextPeer}
          aria-label={nextPeer ? `Next to step ${nextPeer.step}: ${nextPeer.place}` : 'No next step'}
        >
          Next <span aria-hidden="true">&rarr;</span>
        </button>
      </nav>
    </div>
  )
}

/* =========================================================================
   Viz D · Policy Explorer
   --------------------------------------------------------------------------
   Three peers walked in order: California introduces the affordable floor,
   Seattle introduces the AMI cap + in-lieu fund, Massachusetts is the gap.
   Each panel is a single coherent narrative paragraph — the bill is named,
   the mechanism is explained, the term it introduces is defined, all in
   one go. Bolded phrases mark the terms that show up again on the levers.
   ========================================================================= */

// Pull-quote pill: small yellow-card eyebrow that names the step + the term
// the panel is about to teach. Sits between the header and the narrative.
function PeerPill({ kind, term }) {
  const isGap = kind === 'gap'
  if (isGap) {
    return (
      <div className="peer-pill peer-pill-gap">
        <span className="peer-pill-term">{term}</span>
      </div>
    )
  }
  return (
    <div className={`peer-pill${isGap ? ' peer-pill-gap' : ''}`}>
      <span className="">
        This bill introduces the 
      </span>
      <span className="peer-pill-term">"{term}"</span>
    </div>
  )
}

// Reused inside Seattle's narrative — the AMI tier strip with a 50% cap
// marker. Anchors the "≤50% AMI" phrasing to the income spectrum visually.
function AmiBarVisual() {
  const amiBands = [
    { key: 'u30',   label: '<30%',   wage: '<$38k',    color: '#6b2b27' },
    { key: 'a3050', label: '30–50%', wage: '$38–64k',  color: '#a14a35' },
    { key: 'a5080', label: '50–80%', wage: '$64–102k', color: '#d38e42' },
    { key: 'a80p',  label: '80%+',   wage: '$102k+',   color: '#e9c46a' },
  ]
  return (
    <div className="peer-narrative-vis">
      <div className="primer-ami-bar" role="img" aria-label="AMI tiers from very-low income to workforce, with a cap marker at 50%">
        {amiBands.map((b) => (
          <div key={b.key} className="primer-ami-seg" style={{ background: b.color }}>
            <span className="primer-ami-seg-label">{b.label}</span>
            <span className="primer-ami-seg-wage">{b.wage}</span>
          </div>
        ))}
        <div className="primer-ami-cap" aria-hidden="true">
          <div className="primer-ami-cap-line" />
          <div className="primer-ami-cap-label">50% AMI cap</div>
        </div>
      </div>
    </div>
  )
}

// One narrative per peer. Each is a single paragraph describing the bill,
// the mechanism, and the term it introduces — with <strong> on the
// phrases the levers below reuse, so the reader recognizes them on sight.
function PeerNarrative({ peer }) {
  if (peer.key === 'ca') {
    return (
      <p className="peer-narrative">
        California&rsquo;s <strong>SB&nbsp;35</strong> gives developers
        fast-track permits — &le;90-day ministerial approval, no CEQA review
        — but only if the project sets aside at least <strong>20%</strong>
        of new homes as <strong>deed-restricted</strong> affordable, with
        half priced at <strong>&le;50% AMI</strong>. This is the{' '}
        <strong>affordable floor</strong>: a statewide minimum that fixes
        what counts as &ldquo;enough affordability&rdquo; before density
        gets the green light.
      </p>
    )
  }
  if (peer.key === 'sea') {
    return (
      <>
        <p className="peer-narrative">
          Seattle&rsquo;s <strong>MHA</strong> pairs upzoning with a choice:
          every new multifamily project either builds 5–11% deed-restricted
          units on-site or pays a per-unit fee into a city housing fund.
          That <strong>in-lieu fund</strong> stacks with federal LIHTC tax
          credits to build extra units at <strong>&le;50% AMI</strong> —
         called <em>deep affordability</em>. The{' '}
          <strong>AMI cap</strong> sets <em>how deep</em> the affordability
          goes; the fund finances units developers don&rsquo;t build
          directly. WA HB&nbsp;1491 took this statewide in 2025.
        </p>
        <AmiBarVisual />
      </>
    )
  }
  if (peer.key === 'ma') {
    return (
      <p className="peer-narrative">
        The <strong>MBTA Communities Act</strong> zones for density across
        177 transit-served towns — but sets{' '}
        <strong>no statewide affordability floor</strong> and{' '}
        <strong>no in-lieu fund</strong>. Cities can still require modest
        inclusionary shares, but only up to ~10% at 80% AMI without risking
        the law&rsquo;s by-right protection. So a community can comply by
        zoning a district of entirely market-rate towers.
      </p>
    )
  }
  return null
}

// "In the lever model" strip — names the parameters this peer contributes
// to the counterfactual model below, so the numbers the levers use have a
// visible source. Only CA and Seattle contribute parameters; MA renders
// nothing here (it's the contrast peer, not a model input).
function PeerModelStrip({ peer, totalUnits }) {
  if (peer.key === 'ca') {
    const floorUnits = Math.round(totalUnits * 0.20)
    return (
      <div className="peer-model">
        <div className="peer-model-eyebrow">In the lever model →</div>
        <div className="peer-model-row">
          <span className="peer-model-num">20%</span>
          <span className="peer-model-text">
            of every new TOD unit must be deed-restricted on-site
          </span>
        </div>
        <div className="peer-model-result">
          ≈ <strong>{floorUnits.toLocaleString()}</strong> deed-restricted
          homes in the {totalUnits.toLocaleString()}-unit MBTA-near pipeline
        </div>
      </div>
    )
  }
  if (peer.key === 'sea') {
    const fee = FEE_PER_NONAFF_UNIT
    const cost = FUND_COST_PER_AFF_UNIT
    // Ratio of market-rate units needed to fund 1 extra ≤50% AMI home.
    const ratio = Math.round(cost / fee)
    return (
      <div className="peer-model">
        <div className="peer-model-eyebrow">In the lever model →</div>
        <div className="peer-model-row">
          <span className="peer-model-num">${(fee / 1000).toFixed(0)}k</span>
          <span className="peer-model-text">
            in-lieu fee per market-rate unit → city housing fund
          </span>
        </div>
        <div className="peer-model-row">
          <span className="peer-model-num">${(cost / 1000).toFixed(0)}k</span>
          <span className="peer-model-text">
            of fund $ buys each ≤50% AMI home (LIHTC + state credits fill
            the rest)
          </span>
        </div>
        <div className="peer-model-result">
          ≈ <strong>1 extra deeply-affordable home</strong> per {ratio}{' '}
          market-rate units built
        </div>
      </div>
    )
  }
  return null
}

function PolicyExplorer({ activeKey, onSelect, peers, funnel, totalUnits }) {
  const active = peers.find((p) => p.key === activeKey) || peers[0]
  const dynamicValue = (stat) => {
    if (!stat.dynamic) return null
    if (stat.dynamic === 'affPctRealized') return `${funnel.affPct.toFixed(1)}%`
    return null
  }
  // Step navigation: peers are walked in declared order (CA → Seattle → MA).
  // We compute the active index here so Back/Next buttons can move to the
  // adjacent peer without reaching into the chart's selection model.
  const activeIdx = peers.findIndex((p) => p.key === active.key)
  const prevPeer = activeIdx > 0 ? peers[activeIdx - 1] : null
  const nextPeer = activeIdx >= 0 && activeIdx < peers.length - 1 ? peers[activeIdx + 1] : null
  const TERM_LABEL = { floor: 'Affordable floor', ami: 'AMI cap + in-lieu fund', gap: 'The gap' }
  // Receipts: drop the first stat (already in the bar chart above) and use
  // the two outcome numbers as the panel's "proof" strip.
  const receipts = active.stats.slice(1)

  return (
    <div className="policy-explorer">
      <PeerStepper
        peers={peers}
        activeKey={activeKey}
        funnel={funnel}
        prevPeer={prevPeer}
        nextPeer={nextPeer}
        onSelect={onSelect}
        termLabel={TERM_LABEL[active.definitionKind]}
      />

      <div
        id="policy-explorer-panel"
        role="region"
        aria-live="polite"
        aria-label={`${active.place}: ${active.policy}`}
        className="policy-explorer-panel"
        style={{ '--peer-accent': active.accent }}
        key={active.key}
      >
        <div className="policy-explorer-header">
          <div className="policy-explorer-header-line">
            <span className="policy-explorer-header-place">{active.place}</span>
            <span className="policy-explorer-header-dot" aria-hidden="true">&middot;</span>
            <span className="policy-explorer-header-year">{active.year}</span>
          </div>
          <h4 className="policy-explorer-header-policy">
            <a href={active.policyUrl} target="_blank" rel="noopener noreferrer">
              {active.policy}
            </a>
          </h4>
        </div>

        <PeerPill
          kind={active.definitionKind}
          term={TERM_LABEL[active.definitionKind]}
        />

        <PeerNarrative peer={active} />


        <div
          className="peer-receipts"
          role="group"
          aria-label={`${active.place} ${active.policy} outcomes`}
        >
          {receipts.map((stat, i) => (
            <div key={i} className="peer-receipt">
              <div className="peer-receipt-num">
                {dynamicValue(stat) ?? stat.num}
                {stat.unit && !stat.dynamic && (
                  <span className="peer-receipt-unit">{stat.unit}</span>
                )}
              </div>
              <div className="peer-receipt-label">{stat.label}</div>
            </div>
          ))}
        </div>


        <div className="policy-explorer-sources">
          {active.sources.length > 0 && (
            <>
              <span className="policy-explorer-sources-label">Sources:</span>{' '}
              {active.sources.map((s, i) => (
                <span key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label}
                  </a>
                  {i < active.sources.length - 1 ? ' \u00b7 ' : ''}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   Section wrapper
   ========================================================================= */

export default function PolicyGapPanels({ view = 'all' }) {
  // 'levers' renders the merged prescription + peer-evidence article
  // (the standalone peers view has been folded into 'levers' for narrative flow).
  const showLevers = view === 'all' || view === 'levers' || view === 'peers'
  const showWorkers = view === 'all' || view === 'workers'

  const [builds, setBuilds] = useState(null)
  const [error, setError] = useState(false)
  const [activePeer, setActivePeer] = useState('ca')

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

  // Must run before any conditional return (same order every render).
  const mixWithBoth = useMemo(() => {
    if (!stats) return null
    return applyLevers(stats.breakdownPct, { floor: true, deep: true })
  }, [stats])

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

  const { funnel, breakdownPct, totalUnits } = stats
  const baseAffShare = sumAff(breakdownPct)
  const newAffShare = sumAff(mixWithBoth.pct)
  const baseDeepShare = sumDeep(breakdownPct)
  const newDeepShare = sumDeep(mixWithBoth.pct)
  const totalAdded = Math.max(
    0,
    Math.round(((newAffShare - baseAffShare) / 100) * totalUnits)
  )
  const totalDeepAdded = Math.max(
    0,
    Math.round(((newDeepShare - baseDeepShare) / 100) * totalUnits)
  )
  // Total cumulative affordable units in the prescription's scoreboard
  // (baseline on-site + floor lift + fund-funded), used in the closing
  // kicker. Matches the headline on the ScoreboardChart, which sums the
  // full on-site affordable count (newAffShare * totalUnits) and the
  // fund-funded layer.
  const baselineAffUnits = Math.round((baseAffShare / 100) * totalUnits)
  const fundedAffUnits = Math.round(
    (totalUnits * NONAFF_SHARE_AFTER_FLOOR * FEE_PER_NONAFF_UNIT) /
      FUND_COST_PER_AFF_UNIT
  )
  const totalScoreboard = baselineAffUnits + totalAdded + fundedAffUnits

  return (
    <div className="motivation-stack">
      {/* Viz 1+3 merged: Prescription (levers) + Proof (peer states) */}
      {showLevers && (
      <article className="motivation-card motivation-card--combined">
        <header className="motivation-card-header">
          <h3>How MBTA-near housing policies can help build affordable homes</h3>
          <p className="motivation-dek">
            Two other places have tried to address this problem by pairing transit-area zoning with an{' '}
            affordability floor and an in-lieu fund. Walk through them in order &darr;
          </p>
        </header>

        <PolicyExplorer
          peers={PEER_POLICIES}
          activeKey={activePeer}
          onSelect={setActivePeer}
          funnel={funnel}
          totalUnits={totalUnits}
        />

        <div className="motivation-subsection-divider" role="presentation">
          <span className="motivation-subsection-kicker">
            Now apply this idea to the MBTA-near pipeline &darr;
          </span>
        </div>

        <LeverPanel basePct={breakdownPct} totalUnits={totalUnits} />

        <div className="motivation-takeaway">
          Both levers on: roughly{' '}
          <strong>
            {totalScoreboard.toLocaleString()} affordable homes
          </strong>{' '}
          in the MBTA-near pipeline over a decade &mdash;{' '}
          <strong>{baselineAffUnits.toLocaleString()}</strong> already
          deed-restricted in the existing mix,{' '}
          <strong>{totalAdded.toLocaleString()}</strong> more built on-site as
          the inclusionary floor lifts the affordable share to 20%, and{' '}
          <strong>{fundedAffUnits.toLocaleString()}</strong> funded by the
          in-lieu fund, the bulk priced for households under 50% AMI.
          That&rsquo;s the band where the{' '}
          <strong>4 in 10 Greater Boston households</strong> who can&rsquo;t
          afford the average T-stop rent actually sit.
        </div>

        <p className="policy-explorer-close">
          <strong>The affordable-share floor and the in-lieu fund are the
          two pieces left to add.</strong>
        </p>

        <footer className="motivation-source">
          Counterfactual model: 20% inclusionary floor with at least half of the affordable share
          targeted at &le;50% AMI, applied to the {totalUnits.toLocaleString()} MBTA-near units in
          the MassBuilds pipeline (Mar 2026). Peer policies:{' '}
          <a href="https://www.seattle.gov/housing/housing-developers/mandatory-housing-affordability" target="_blank" rel="noopener noreferrer">Seattle MHA</a>{' '}·{' '}
          <a href="https://ternercenter.berkeley.edu/research-and-policy/sb-35-evaluation/" target="_blank" rel="noopener noreferrer">Terner Center SB 35 evaluation</a>{' '}·{' '}
          <a href="https://app.leg.wa.gov/billsummary?BillNumber=1491&Year=2025" target="_blank" rel="noopener noreferrer">Washington HB 1491</a>.
          {' '}MA context:{' '}
          <a href="https://www.mass.gov/info-details/multi-family-zoning-requirement-for-mbta-communities" target="_blank" rel="noopener noreferrer">MBTA Communities</a>{' '}·{' '}
          <a href="https://www.mass.gov/info-details/the-affordable-homes-act-smart-housing-livable-communities" target="_blank" rel="noopener noreferrer">Affordable Homes Act</a>{' '}·{' '}
          <a href="https://www.mapc.org/planning101/affordability-effectiveness-section-3a/" target="_blank" rel="noopener noreferrer">MAPC Section 3A analysis</a>.
        </footer>
      </article>
      )}

      {/* Viz 2: Worker Picker — interactive empathy */}
      {showWorkers && (
      <article className="motivation-card">
        <header className="motivation-card-header">
          <h3>Pick a worker. See what the housing pipeline offers her.</h3>
          <p className="motivation-dek">
          Each worker represents a real Greater Boston wage. The colored homes show how many of every 100 new MBTA-near units are priced within her income tier.
          </p>
        </header>

        <WorkerPicker basePct={breakdownPct} totalUnits={totalUnits} />

        <footer className="motivation-source">
          Wages: U.S. Bureau of Labor Statistics, OEWS, May 2023, Boston-Cambridge-Nashua MA-NH
          MSA, median annual wage by SOC code. AMI base: HUD FY2024 income limits, Boston HMFA,
          2-person 100% AMI = $127,200. Unit mix: MassBuilds (Mar 2026), MBTA-served projects
          completed and under construction.
        </footer>
      </article>
      )}

    </div>
  )
}
