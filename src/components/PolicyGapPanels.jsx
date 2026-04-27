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
   use — as three independently toggleable levers. Each lever applies a
   simple, conservative rule on top of the breakdown.

     1. FLOOR        — at least 20% of new units must be deed-restricted.
                       Top up `affordable` by pulling from `market`.
     2. DEEP_TARGET  — half of the required affordable share must be at
                       <=50% AMI. Reallocate within the affordable pool.
     3. ANTI_DISPL   — local resident preference + tenant protections.
                       Doesn't change unit count, but it does change WHO
                       gets the keys: the same units now go to current
                       transit-dependent renters instead of new arrivals.

   Output: a {u30, a3050, a5080, a80p, market} pct breakdown that always
   sums to ~100, plus a `localPref` flag that the UI uses to annotate.
   ========================================================================= */

function applyLevers(basePct, levers) {
  const out = { ...basePct }
  const total = 100

  if (levers.floor) {
    // Bring total affordable share up to 20%
    const floor = 20
    const aff = out.u30 + out.a3050 + out.a5080 + out.a80p
    if (aff < floor) {
      const need = floor - aff
      // Pull from market (most flexible). Distribute new affordable
      // units 50/50 across moderate (50-80) and workforce (80+) by default.
      out.market = Math.max(0, out.market - need)
      out.a5080 += need * 0.6
      out.a80p += need * 0.4
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

  return { pct: out, localPref: !!levers.antiDispl }
}

/* =========================================================================
   Viz A · The Lever Rack
   --------------------------------------------------------------------------
   Three policy toggles. Each pulls "how to build affordable homes near MBTA"
   from the abstract into something the reader can DO. As they flip switches,
   the 100-unit stack transforms in real time and worker icons light up.
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
  {
    id: 'antiDispl',
    title: 'Tenant + resident protections',
    short: 'Anti-displacement',
    desc:
      'Pair upzoning with local-resident preference, just-cause eviction, and rent stabilization so existing renters can stay.',
    peer: 'WA HB 1491 · 2025',
  },
]

// Stylized worker income points (BLS Boston MSA medians, 2-person AMI base).
// Used by both the Lever Rack (which workers light up) and the Worker Picker.
const BOSTON_AMI_100_2P = 127200
const WORKERS = [
  { name: 'Retail salesperson', wage: 36170, icon: '🛍️' },
  { name: 'Home health aide', wage: 37440, icon: '🏥' },
  { name: 'Childcare worker', wage: 39120, icon: '🧸' },
  { name: 'Janitor', wage: 39940, icon: '🧹' },
  { name: 'Line cook', wage: 44200, icon: '🍳' },
  { name: 'Preschool teacher', wage: 45300, icon: '✏️' },
  { name: 'EMT', wage: 46090, icon: '🚑' },
  { name: 'MBTA bus driver', wage: 62520, icon: '🚌' },
  { name: 'Construction laborer', wage: 62920, icon: '🔨' },
  { name: 'Firefighter', wage: 75050, icon: '🚒' },
  { name: 'Police officer', wage: 76560, icon: '🚓' },
  { name: 'Elementary teacher', wage: 87660, icon: '🍎' },
  { name: 'Registered nurse', wage: 100360, icon: '💉' },
].map((w) => ({ ...w, ami: (w.wage / BOSTON_AMI_100_2P) * 100 }))

function workerTier(ami) {
  if (ami < 30) return 'u30'
  if (ami < 50) return 'a3050'
  if (ami < 80) return 'a5080'
  return 'a80p'
}
// Returns the set of unit tiers a worker can compete for
function tiersAccessibleTo(ami) {
  if (ami < 30) return new Set(['u30'])
  if (ami < 50) return new Set(['u30', 'a3050'])
  if (ami < 80) return new Set(['u30', 'a3050', 'a5080'])
  return new Set(['u30', 'a3050', 'a5080', 'a80p'])
}

function LeverPanel({ basePct, totalUnits }) {
  const [levers, setLevers] = useState({ floor: false, deep: false, antiDispl: false })
  const result = useMemo(() => applyLevers(basePct, levers), [basePct, levers])

  const toggle = (id) => setLevers((s) => ({ ...s, [id]: !s[id] }))
  const reset = () => setLevers({ floor: false, deep: false, antiDispl: false })
  const enableAll = () =>
    setLevers({ floor: true, deep: true, antiDispl: true })

  // Which workers gain housing? A worker "gains" if the share of units they
  // can compete for (their tier + below) increased by ≥1 pp vs. baseline.
  const baseAccess = (w) => {
    const tiers = tiersAccessibleTo(w.ami)
    let s = 0
    for (const t of tiers) s += basePct[t] || 0
    return s
  }
  const newAccess = (w) => {
    const tiers = tiersAccessibleTo(w.ami)
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
        <button type="button" className="lever-mini lever-mini-primary" onClick={enableAll} disabled={numLevers === 3}>
          Pull all three
        </button>
      </div>

      <div className="lever-output">
        <div className="lever-output-bars">
          <div className="lever-bar-row">
            <div className="lever-bar-label">
              <span className="lever-bar-eyebrow">Today, no levers pulled</span>
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
                  ? 'With no levers, nothing changes'
                  : `With ${numLevers} lever${numLevers > 1 ? 's' : ''} pulled`}
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

        <div className="lever-impact">
          <div className="lever-impact-stat">
            <div className="lever-impact-num">
              {totalAdded > 0 ? `+${totalAdded.toLocaleString()}` : '0'}
            </div>
            <div className="lever-impact-label">
              affordable homes near MBTA<br/>
              <span className="lever-impact-sub">
                projected, applied to {totalUnits.toLocaleString()} units already in the pipeline
              </span>
            </div>
          </div>
          <div className="lever-impact-stat lever-impact-stat-alt">
            <div className="lever-impact-num">
              {totalDeepAdded > 0 ? `+${totalDeepAdded.toLocaleString()}` : '0'}
            </div>
            <div className="lever-impact-label">
              deeply affordable<br/>
              <span className="lever-impact-sub">homes for renters earning under 50% AMI</span>
            </div>
          </div>
          {result.localPref && (
            <div className="lever-impact-badge">
              + Tenant protections + local preference: keys go to current transit-dependent renters
            </div>
          )}
        </div>

        <div className="lever-workers">
          <div className="lever-workers-eyebrow">
            Workers who gain access {numLevers === 0 ? '(pull a lever to start)' : `(${workersLitUp.length}/13)`}
          </div>
          <div className="lever-workers-grid">
            {WORKERS.map((w) => {
              const lit = workersLitUp.includes(w)
              const wage = `$${(w.wage / 1000).toFixed(0)}k`
              return (
                <div
                  key={w.name}
                  className={`lever-worker ${lit ? 'lever-worker-on' : ''}`}
                  title={`${w.name} · ${wage} (${w.ami.toFixed(0)}% AMI)`}
                >
                  <span className="lever-worker-icon" aria-hidden="true">{w.icon}</span>
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
   Pick one of 13 Greater Boston occupations. A grid of 100 little "houses"
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
  const [selected, setSelected] = useState('Childcare worker')
  const [showFloor, setShowFloor] = useState(false)

  const worker = WORKERS.find((w) => w.name === selected) || WORKERS[2]
  const tiers = tiersAccessibleTo(worker.ami)
  const accessibleTier = workerTier(worker.ami)

  // Apply the proposed package: 20% floor + deep AMI cap.
  const projected = useMemo(
    () => applyLevers(basePct, { floor: true, deep: true }).pct,
    [basePct]
  )

  const housesNow = useMemo(() => buildHouseLayout(basePct), [basePct])
  const housesNew = useMemo(() => buildHouseLayout(projected), [projected])
  const houses = showFloor ? housesNew : housesNow

  // Per-100 counts she can compete for
  const accessibleCount = (layout) => layout.filter((k) => tiers.has(k)).length
  const nowCount = accessibleCount(housesNow)
  const newCount = accessibleCount(housesNew)
  const realNow = Math.round((nowCount / 100) * totalUnits)
  const realNew = Math.round((newCount / 100) * totalUnits)
  const delta = realNew - realNow

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

          <div className="worker-toggle" role="group" aria-label="Toggle policy state">
            <button
              type="button"
              className={`worker-toggle-btn ${!showFloor ? 'on' : ''}`}
              onClick={() => setShowFloor(false)}
              aria-pressed={!showFloor}
            >
              Today
            </button>
            <button
              type="button"
              className={`worker-toggle-btn ${showFloor ? 'on' : ''}`}
              onClick={() => setShowFloor(true)}
              aria-pressed={showFloor}
            >
              With 20% floor at 50% AMI
            </button>
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
                <span className={`worker-callout-now ${!showFloor ? 'is-active' : ''}`}>{nowCount}</span>
                <span className="worker-callout-arrow">→</span>
                <span className={`worker-callout-new ${showFloor ? 'is-active' : ''}`}>{newCount}</span>
              </div>
              <div className="worker-callout-sub">
                priced for a {worker.name.toLowerCase()}
              </div>
            </div>

            <div className="worker-callout-row worker-callout-real">
              <div className="worker-callout-eyebrow">In real units already in the MBTA-near pipeline</div>
              <div className="worker-callout-real-row">
                <span>{realNow.toLocaleString()}</span>
                <span className="worker-callout-arrow">→</span>
                <span className="worker-callout-real-new">{realNew.toLocaleString()}</span>
              </div>
              <div className="worker-callout-delta">
                {delta > 0
                  ? `+${delta.toLocaleString()} more homes a ${worker.name.toLowerCase()} could compete for`
                  : 'No change'}
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
    key: 'ma',
    place: 'Massachusetts',
    policy: 'MBTA Communities Act',
    year: 2021,
    floor: 0,
    floorLabel: 'No floor',
    usesRealized: true,
    description:
      'Zones for density near transit but sets no affordability requirement. Local inclusionary ordinances are capped at 10% at 80% AMI to remain as-of-right.',
    accent: '#DA291C',
    isFocus: true,
  },
  {
    key: 'mont',
    place: 'Montgomery County, MD',
    policy: 'Moderately-Priced Dwelling Unit (MPDU)',
    year: 1974,
    floor: 13.5,
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
    floor: 9,
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
      'Requires affordable units in every residential development inside transit station areas, with property-tax exemptions and fee reductions as incentives.',
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
      .attr('class', 'policy-peer-row')
      .attr('transform', (d) => `translate(0, ${y(d.key)})`)

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

  const { funnel, breakdownPct, totalUnits } = stats

  return (
    <div className="motivation-stack">
      {/* Viz 1: The Lever Rack — interactive prescription */}
      <article className="motivation-card">
        <header className="motivation-card-header">
          <h3>How to actually build affordable homes near the MBTA: pull these three levers.</h3>
          <p className="motivation-dek">
            The MBTA Communities Act zones for density. The Affordable Homes Act funds construction.
            Neither requires that the homes be priced for the working renters who depend on transit.
            Three policy levers — already in place in peer states — would turn that capacity into
            homes for workers. Toggle them below to see how the unit mix shifts.
          </p>
        </header>

        <LeverPanel basePct={breakdownPct} totalUnits={totalUnits} />

        <div className="motivation-takeaway">
          With all three levers pulled, MA would build roughly{' '}
          <strong>1 in 5 new MBTA-near homes</strong> at deed-restricted prices — and{' '}
          <strong>1 in 10</strong> at <Jargon term="deep affordability">deep affordability</Jargon>{' '}
          (under 50% <Jargon term="AMI">AMI</Jargon>) — without changing a single line of zoning code.
          The blueprint is already proven from California to Maryland to Washington.
        </div>

        <footer className="motivation-source">
          Counterfactual model: 20% inclusionary floor with at least half of the affordable share
          targeted at &le;50% AMI, applied to the {totalUnits.toLocaleString()} MBTA-near units in
          the MassBuilds pipeline (Mar 2026). Sources:{' '}
          <a href="https://www.mass.gov/info-details/multi-family-zoning-requirement-for-mbta-communities" target="_blank" rel="noopener noreferrer">MBTA Communities</a>{' '}·{' '}
          <a href="https://www.mass.gov/info-details/the-affordable-homes-act-smart-housing-livable-communities" target="_blank" rel="noopener noreferrer">Affordable Homes Act</a>{' '}·{' '}
          <a href="https://www.mapc.org/planning101/affordability-effectiveness-section-3a/" target="_blank" rel="noopener noreferrer">MAPC Section 3A analysis</a>.
        </footer>
      </article>

      {/* Viz 2: Worker Picker — interactive empathy */}
      <article className="motivation-card">
        <header className="motivation-card-header">
          <h3>Pick a worker. See the homes near her T stop.</h3>
          <p className="motivation-dek">
            A line cook makes $44k. A childcare worker, $39k. A registered nurse, $100k. Each
            occupies a different rung of the income ladder — and the housing built next to their
            bus stops treats them very differently. Tap a worker to see how many of every 100
            new MBTA-near homes she can compete for, and how that changes with the proposed
            floor.
          </p>
        </header>

        <WorkerPicker basePct={breakdownPct} totalUnits={totalUnits} />

        <div className="motivation-takeaway">
          Today, a <strong>childcare worker</strong> can compete for fewer than 7 of every 100
          new MBTA-near homes. With a 20% floor at 50% AMI, that more than triples — and the
          same lever delivers homes for line cooks, EMTs, teachers, and nurses too. Affordability
          isn&rsquo;t one bracket; it&rsquo;s a ladder, and the floor adds rungs near the bottom.
        </div>

        <footer className="motivation-source">
          Wages: U.S. Bureau of Labor Statistics, OEWS, May 2023, Boston-Cambridge-Nashua MA-NH
          MSA, median annual wage by SOC code. AMI base: HUD FY2024 income limits, Boston HMFA,
          2-person 100% AMI = $127,200. Unit mix: MassBuilds (Mar 2026), MBTA-served projects
          completed and under construction.
        </footer>
      </article>

      {/* Viz 3: Peer comparison */}
      <article className="motivation-card">
        <header className="motivation-card-header">
          <h3>Peer states already paired their density laws with a floor.</h3>
          <p className="motivation-dek">
            Massachusetts isn&rsquo;t the first state to <Jargon term="upzone">upzone</Jargon>{' '}
            near transit. Four peer jurisdictions paired density with a{' '}
            <strong>statewide or county-wide <Jargon term="affordability floor">affordability
            floor</Jargon></strong> — the exact lever MBTA Communities left out. The bar shows
            each regime&rsquo;s required affordable share; the black diamond on the top row is
            what MA actually built near the T, with no floor in place.
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
          Montgomery County, Seattle, California, and Washington all reached the same conclusion:
          density without an affordability floor leaves the workers who depend on transit behind.
          Massachusetts has built the zoning. <strong>The missing piece is the floor</strong>.
        </div>

        <footer className="motivation-source">
          Sources:{' '}
          <a href="https://montgomerycountymd.gov/DHCA/housing/singlefamily/mpdu/produced.html" target="_blank" rel="noopener noreferrer">Montgomery County MPDU</a>{' '}·{' '}
          <a href="https://www.seattle.gov/housing/housing-developers/mandatory-housing-affordability" target="_blank" rel="noopener noreferrer">Seattle MHA</a>{' '}·{' '}
          <a href="https://ternercenter.berkeley.edu/research-and-policy/sb-35-evaluation/" target="_blank" rel="noopener noreferrer">Terner Center SB 35 evaluation</a>{' '}·{' '}
          <a href="https://app.leg.wa.gov/billsummary?BillNumber=1491&Year=2025" target="_blank" rel="noopener noreferrer">Washington HB 1491</a>.
        </footer>
      </article>
    </div>
  )
}
