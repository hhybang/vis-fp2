import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { loadMassBuilds } from '../utils/dataLoaders'
import { GLOSSARY } from '../utils/glossary'

/* =========================================================================
   Inline jargon tooltips (housing-policy copy is full of domain terms;
   readers get a dotted underline + hover/focus definition popup).
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
    title: (
      <>
        20% <Jargon term="inclusionary floor">inclusionary floor</Jargon>
      </>
    ),
    short: 'Affordability floor',
    desc:
      'Require every TOD project near MBTA to set aside at least 20% of units as deed-restricted affordable.',
    peer: 'CA SB 35 · Bay Area',
  },
  {
    id: 'deep',
    title: 'Cap at 50% AMI',
    short: 'Deep AMI targeting',
    desc:
      'Half of those affordable units must serve households under 50% AMI — the renters with the least access to a car.',
    peer: 'Montgomery County MPDU',
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
// Cumulative: unit tiers a worker can *compete for* (lottery-style) — used by WorkerPicker.
function tiersAccessibleTo(ami) {
  if (ami < 30) return new Set(['u30'])
  if (ami < 50) return new Set(['u30', 'a3050'])
  if (ami < 80) return new Set(['u30', 'a3050', 'a5080'])
  return new Set(['u30', 'a3050', 'a5080', 'a80p'])
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

  // Counts for the headline
  const baseAff = basePct.u30 + basePct.a3050 + basePct.a5080 + basePct.a80p
  const newAff = result.pct.u30 + result.pct.a3050 + result.pct.a5080 + result.pct.a80p
  const baseDeep = basePct.u30 + basePct.a3050
  const newDeep = result.pct.u30 + result.pct.a3050
  const totalAdded = Math.round(((newAff - baseAff) / 100) * totalUnits)
  const totalDeepAdded = Math.round(((newDeep - baseDeep) / 100) * totalUnits)
  const numLevers = Object.values(levers).filter(Boolean).length
  const mixLeverCount = (levers.floor ? 1 : 0) + (levers.deep ? 1 : 0)

  return (
    <div className="lever-panel">
      <div className="lever-rack" role="group" aria-label="Policy levers">
        {LEVERS.map((lv) => {
          const on = levers[lv.id]
          return (
            <button
              key={lv.id}
              type="button"
              className={`lever ${on ? 'lever-on' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(lv.id)}
            >
              <div className="lever-switch" aria-hidden="true">
                <span className="lever-knob" />
                <span className="lever-glow" />
              </div>
              <div className="lever-text">
                <div className="lever-eyebrow">{lv.short}</div>
                <div className="lever-title">{lv.title}</div>
                <div className="lever-desc">{lv.desc}</div>
                <div className="lever-peer">{lv.peer}</div>
              </div>
              <div className="lever-state" aria-hidden="true">{on ? 'ON' : 'OFF'}</div>
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

      <p className="lever-legend-captions" id="lever-legend-captions">
        Bars = <strong>pipeline</strong> units by band. <strong>Floor</strong> +{' '}
        <strong>deep-AMI</strong> reweight the stack. The peer rows
        only show the share floor&mdash;not the band split, which is only
        in these bars.
      </p>

      <div className="lever-output" aria-describedby="lever-legend-captions">
        <div className="lever-output-bars">
          <div className="lever-bar-row">
            <div className="lever-bar-label">
              <span className="lever-bar-eyebrow">Current pipeline (MassBuilds) — baseline</span>
              <span className="lever-bar-stat">
                {baseAff.toFixed(0)}% affordable · {baseDeep.toFixed(1)}% deep
              </span>
            </div>
            <div className="lever-bar lever-bar-base">
              {TIERS.map((t) => (
                <div
                  key={t.key}
                  className="lever-bar-seg"
                  style={{ width: `${basePct[t.key]}%`, background: t.color }}
                  title={`${t.label} · ${basePct[t.key].toFixed(1)}%`}
                />
              ))}
            </div>
          </div>
          <div className="lever-bar-row">
            <div className="lever-bar-label">
              <span className="lever-bar-eyebrow">
                {numLevers === 0
                  ? 'Levers off: same mix as above (toggle to reweight)'
                  : `After: ${mixLeverCount} lever${mixLeverCount > 1 ? 's' : ''} in the model`}
              </span>
              <span className="lever-bar-stat">
                {newAff.toFixed(0)}% affordable · {newDeep.toFixed(1)}% deep
              </span>
            </div>
            <div className="lever-bar lever-bar-new">
              {TIERS.map((t) => (
                <div
                  key={t.key}
                  className="lever-bar-seg"
                  style={{ width: `${result.pct[t.key]}%`, background: t.color }}
                  title={`${t.label} · ${result.pct[t.key].toFixed(1)}%`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="lever-bar-legend">
          {TIERS.map((t) => (
            <span key={t.key} className="lever-legend-item">
              <span className="lever-legend-swatch" style={{ background: t.color }} />
              {t.label}
              <span className="lever-legend-sub"> · {t.sub}</span>
            </span>
          ))}
        </div>

        {numLevers > 0 && (
          <ul className="lever-sidenotes" aria-label="Model notes for your selection">
            {levers.floor && (
              <li>
                {Math.abs(dAffFromFloor) < 0.1
                  ? 'Affordability floor: the modeled pipeline is already at or above a 20% deed-restricted share, so this bar may barely move. Where the share is under 20%, the floor pulls the difference out of the market segment.'
                  : `Affordability floor: +${dAffFromFloor.toFixed(1)} pp toward deed-restricted, from market, split across the four affordable bands in proportion to the current mix.`}
              </li>
            )}
            {levers.deep && (
              <li>
                {Math.abs(dDeepFromDeep) < 0.1
                  ? 'Deep-AMI: the affordable stack in the model is already at least half at or below 50% AMI, so the bar can stay flat. Otherwise this lever deepens the left side of the stack from higher AMI bands and market, in that order.'
                  : `Deep-AMI: +${dDeepFromDeep.toFixed(1)} percentage points toward &lt;50% AMI in the model.`}
              </li>
            )}
          </ul>
        )}

        <div className="lever-impact">
          <div className="lever-impact-stat">
            <div className="lever-impact-num">
              {totalAdded > 0 ? `+${totalAdded.toLocaleString()}` : '0'}
            </div>
            <div className="lever-impact-label">
              additional deed-restricted homes near MBTA
              <br />
              <span className="lever-impact-sub">
                projected on {totalUnits.toLocaleString()} pipeline units, vs. the
                mix above
              </span>
            </div>
          </div>
          <div className="lever-impact-stat lever-impact-stat-alt">
            <div className="lever-impact-num">
              {totalDeepAdded > 0 ? `+${totalDeepAdded.toLocaleString()}` : '0'}
            </div>
            <div className="lever-impact-label">
              more toward deep affordability
              <br />
              <span className="lever-impact-sub">
                under 50% AMI in the model, vs. current pipeline
              </span>
            </div>
          </div>
        </div>

        <div className="lever-workers">
          <div className="lever-workers-eyebrow">
            {numLevers === 0
              ? 'Illustrative: bold = ≥1 pp in deed bands for that income. Over 80% AMI, only the workforce (80%+) band counts&mdash;not the whole <80% stack'
              : `Bolder: ≥1 pp in bands for that income · ${workersLitUp.length} of ${WORKERS.length}`}
          </div>
          <div className="lever-workers-grid">
            {WORKERS.map((w) => {
              const mixUp = newAccess(w) - baseAccess(w) >= 1
              const wage = `$${(w.wage / 1000).toFixed(0)}k`
              return (
                <div
                  key={w.name}
                  className={`lever-worker ${mixUp ? 'lever-worker-on' : ''}`}
                  title={`${w.name} · ${wage} (${w.ami.toFixed(0)}% AMI)`}
                >
                  <span className="lever-worker-icon" aria-hidden="true">
                    {w.icon}
                  </span>
                  <span className="lever-worker-name">{w.name}</span>
                  <span className="lever-worker-wage">{wage}</span>
                </div>
              )
            })}
          </div>
        </div>
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
              The accessible homes (colored) are the only units a {worker.name.toLowerCase()} can win in a
              housing lottery near a T stop. The rest are priced above her income tier.
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
    place: 'California',
    policy: 'SB 35 Streamlining',
    policyShort: 'SB 35',
    policyUrl:
      'https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=201720180SB35',
    year: 2017,
    floor: 20,
    floorLabel: '20% required (Bay Area)',
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
    key: 'mont',
    place: 'Montgomery County, MD',
    policy: 'Moderately-Priced Dwelling Unit',
    policyShort: 'MPDU',
    policyUrl: 'https://montgomerycountymd.gov/DHCA/housing/singlefamily/mpdu/produced.html',
    year: 1974,
    floor: 13.5,
    floorLabel: '12.5–15% required',
    accent: '#4d5a3f',
    isFocus: false,
    pieces: {
      zoning: { has: false, label: 'No TOD-specific upzoning', detail: 'Countywide, not transit-targeted' },
      floor: { has: true, label: 'Affordability floor', detail: '12.5–15% on every 20+ unit project' },
    },
    stats: [
      { num: '12.5–15%', unit: '', label: 'required affordable share' },
      { num: '50', unit: 'yrs', label: 'in operation since 1974' },
      { num: '17,300', unit: '+', label: 'deed-restricted homes produced' },
    ],
    description:
      'One of the oldest inclusionary-zoning laws in the US. Every development of 20+ units must include 12.5–15% deed-restricted affordable. Proves a share floor can run for half a century without choking off supply.',
    sources: [
      { label: 'Montgomery County DHCA', url: 'https://montgomerycountymd.gov/DHCA/housing/singlefamily/mpdu/produced.html' },
    ],
  },
  {
    key: 'sea',
    place: 'Seattle, WA',
    policy: 'Mandatory Housing Affordability',
    policyShort: 'MHA',
    policyUrl: 'https://www.seattle.gov/housing/housing-developers/mandatory-housing-affordability',
    year: 2019,
    floor: 9,
    floorLabel: '5–11% required',
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
    place: 'Massachusetts',
    policy: 'MBTA Communities Act',
    policyShort: 'MA today',
    policyUrl: 'https://www.mass.gov/info-details/multi-family-zoning-requirement-for-mbta-communities',
    year: 2021,
    floor: 0,
    floorLabel: 'No floor',
    accent: '#DA291C',
    isFocus: true,
    usesRealized: true,
    pieces: {
      zoning: { has: true, label: 'By-right TOD zoning', detail: 'MBTA Communities Act' },
      floor: { has: false, label: 'No statewide floor', detail: 'Local IZ effectively capped at 10% at 80% AMI' },
    },
    stats: [
      { num: '0%', unit: '', label: 'required affordable share' },
      { num: '177', unit: '', label: 'communities subject to the law' },
      { num: 'TBD', unit: '%', label: 'pipeline share realized', dynamic: 'affPctRealized' },
    ],
    description:
      'Zones for density near transit but sets no statewide affordability requirement. Local inclusionary ordinances above 10% at 80% AMI risk losing their as-of-right status, so a community can comply by zoning a district of entirely market-rate towers.',
    sources: [
      { label: 'Mass.gov MBTA Communities', url: 'https://www.mass.gov/info-details/multi-family-zoning-requirement-for-mbta-communities' },
      { label: 'MAPC Section 3A analysis', url: 'https://www.mapc.org/planning101/affordability-effectiveness-section-3a/' },
    ],
  },
]

function PeerComparison({ funnel, activeKey, onSelect }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const data = PEER_POLICIES.map((p) =>
      p.usesRealized ? { ...p, realized: funnel.affPct } : p
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
      .attr('class', (d) => `policy-peer-row${d.key === activeKey ? ' policy-peer-row-active' : ''}`)
      .attr('transform', (d) => `translate(0, ${y(d.key)})`)
      .attr('tabindex', onSelect ? 0 : null)
      .attr('role', onSelect ? 'button' : null)
      .attr('aria-label', (d) => (onSelect ? `Show details for ${d.place} ${d.policy}` : null))
      .style('cursor', onSelect ? 'pointer' : null)
      .on('click', onSelect ? (_, d) => onSelect(d.key) : null)
      .on('mouseenter', onSelect ? (_, d) => onSelect(d.key) : null)
      .on('focus', onSelect ? (_, d) => onSelect(d.key) : null)
      .on('keydown', onSelect
        ? (event, d) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(d.key)
            }
          }
        : null)

    rows
      .append('rect')
      .attr('x', -margin.left + 4)
      .attr('y', -2)
      .attr('width', chartW + margin.left + margin.right - 8)
      .attr('height', y.bandwidth() + 4)
      .attr('fill', (d) => (d.key === activeKey ? '#fff5d6' : 'transparent'))
      .attr('rx', 3)

    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', chartW)
      .attr('height', y.bandwidth())
      .attr('fill', (d) => (d.isFocus ? '#faeaeb' : '#efeadb'))

    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', (d) => Math.max(x(d.floor), 0))
      .attr('height', y.bandwidth())
      .attr('fill', (d) => d.accent)
      .attr('opacity', 0.9)

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

    rows
      .filter((d) => d.realized != null)
      .append('path')
      .attr('d', d3.symbol().type(d3.symbolDiamond).size(110))
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
  }, [funnel, activeKey, onSelect])

  return <svg ref={svgRef} className="policy-gap-svg" />
}

/* =========================================================================
   Viz D · Policy Explorer
   --------------------------------------------------------------------------
   Tabs across all five jurisdictions. Each tab opens a detail panel showing
   what that jurisdiction has (the two-piece stack: by-right zoning + share
   floor), what the law produced (a 3-stat outcomes strip), and a one-line
   description with citation links. Designed to mirror the T-line tabs in
   ScrollyStory so the visual language of "interactive comparison" stays
   consistent across the piece.
   ========================================================================= */

function PolicyExplorer({ activeKey, onSelect, peers, funnel }) {
  const active = peers.find((p) => p.key === activeKey) || peers[0]
  const dynamicValue = (stat) => {
    if (!stat.dynamic) return null
    if (stat.dynamic === 'affPctRealized') return `${funnel.affPct.toFixed(1)}%`
    return null
  }

  return (
    <div className="policy-explorer">
      <figure
        className="policy-explorer-compare"
        aria-label="Required affordable share, all five jurisdictions"
      >
        <figcaption className="policy-explorer-compare-cap">
          Hover or click any row to read about that bill &darr;
        </figcaption>
        <PeerComparison funnel={funnel} activeKey={activeKey} onSelect={onSelect} />
      </figure>

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

        <div className="policy-explorer-pieces" aria-label="What this jurisdiction has">
          {[active.pieces.zoning, active.pieces.floor].map((piece, i) => (
            <div
              key={i}
              className={`policy-explorer-piece${piece.has ? ' policy-explorer-piece-on' : ' policy-explorer-piece-off'}`}
            >
              <span className="policy-explorer-piece-mark" aria-hidden="true">
                {piece.has ? '\u2713' : '\u2014'}
              </span>
              <div className="policy-explorer-piece-label">{piece.label}</div>
              <div className="policy-explorer-piece-detail">{piece.detail}</div>
            </div>
          ))}
        </div>

        <div
          className="policy-explorer-stats"
          role="group"
          aria-label={`${active.place} ${active.policy} outcomes`}
        >
          {active.stats.map((stat, i) => (
            <div key={i} className="policy-explorer-stat">
              <div className="policy-explorer-stat-num">
                {dynamicValue(stat) ?? stat.num}
                {stat.unit && !stat.dynamic && (
                  <span className="policy-explorer-stat-unit">{stat.unit}</span>
                )}
              </div>
              <div className="policy-explorer-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        <p className="policy-explorer-desc">{active.description}</p>

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

  return (
    <div className="motivation-stack">
      {/* Viz 1+3 merged: Prescription (levers) + Proof (peer states) */}
      {showLevers && (
      <article className="motivation-card motivation-card--combined">
        <header className="motivation-card-header">
          <h3>How to actually build affordable homes near the MBTA</h3>
          <p className="motivation-dek">
            Three other places already pair transit-area zoning with an{' '}
            <Jargon term="affordability floor">affordability floor</Jargon>.
            Massachusetts has the zoning. Hover any row in the chart below to
            see how that bill works &mdash; then test the same idea on the
            MBTA-near pipeline.
          </p>
        </header>

        <PolicyExplorer
          peers={PEER_POLICIES}
          activeKey={activePeer}
          onSelect={setActivePeer}
          funnel={funnel}
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
            {totalAdded.toLocaleString()} additional deed-restricted homes
          </strong>{' '}
          in the MBTA-near pipeline, with{' '}
          <strong>{totalDeepAdded.toLocaleString()}</strong> of those priced for
          households under 50% <Jargon term="AMI">AMI</Jargon> &mdash; the band
          where the <strong>4 in 10 Greater Boston households</strong> who can&rsquo;t
          afford the average T-stop rent actually sit, including renters like
          Jane Santos along the Green Line Extension and Betty Gordon on the
          Fairmount Line.
        </div>

        <p className="policy-explorer-close">
          Each jurisdiction above built a variation on the same idea: density
          paired with a required share for working renters. Massachusetts
          already passed the density.{' '}
          <strong>The affordable-share floor is the piece left to add.</strong>
        </p>

        <footer className="motivation-source">
          Counterfactual model: 20% inclusionary floor with at least half of the affordable share
          targeted at &le;50% AMI, applied to the {totalUnits.toLocaleString()} MBTA-near units in
          the MassBuilds pipeline (Mar 2026). Peer policies:{' '}
          <a href="https://montgomerycountymd.gov/DHCA/housing/singlefamily/mpdu/produced.html" target="_blank" rel="noopener noreferrer">Montgomery County MPDU</a>{' '}·{' '}
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
