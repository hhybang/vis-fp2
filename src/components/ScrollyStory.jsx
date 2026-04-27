import { useEffect, useRef, useState } from 'react'
import StoryMap from './StoryMap'
import DailyNeedsPanel from './DailyNeedsPanel'
import JobAccessPanel from './JobAccessPanel'
import MotivationPanels from './MotivationPanels'
import PolicyGapPanels from './PolicyGapPanels'
import PolicyVenn from './PolicyVenn'
import KeyTermsButton from './KeyTermsButton'
import tree1 from '../imgs/trees/cartoon-tree-1.png'
import tree2 from '../imgs/trees/cartoon-tree-2.png'
import tree3 from '../imgs/trees/cartoon-tree-3.png'
import tree4 from '../imgs/trees/cartoon-tree-4.png'
import tree5 from '../imgs/trees/cartoon-tree-5.png'
import tree6 from '../imgs/trees/cartoon-tree-6.png'
import './scrolly.css'

const TREE_IMGS = [tree1, tree2, tree3, tree4, tree5, tree6]

const TREES = [
  { left: '95%', size: 90, bottom: 0 },
  { left: '77%', size: 120, bottom: 0 },
  { left: '74%', size: 150, bottom: 0 },
  { left: '85%', size: 150, bottom: 0 },
  { left: '80%', size: 180, bottom: 0 },
  { left: '87%', size: 300, bottom: 0 },
]

const PEOPLE_PER_SIDE = 2520
const RED_RATIO = 0.4

const QUOTES = [
  {
    name: 'Jane Santos',
    area: 'Somerville, near the Green Line Extension',
    text: '"They can\u2019t afford the rent anymore\u2026 It\u2019s because of the train, 100 percent."',
    source: 'WBUR',
    sourceTitle: 'Somerville renters say the new MBTA stations could price them out of the neighborhood',
    date: 'March 24, 2022',
  },
  {
    name: 'Betty Gordon',
    area: 'Mattapan, near the Fairmount Line',
    text: '"Now they want to push us out."',
    source: 'GBH',
    sourceTitle: 'They Want To Push Us Out: Mattapan Renters Fear Eviction As New Rail Stops Drive Rent Increases',
    date: 'December 14, 2020',
  },
  {
    name: 'A Fairmount Line resident',
    area: 'via community activist Allentza Michel',
    text: '"This train is not for us."',
    source: 'GBH',
    sourceTitle: 'They Want To Push Us Out: Mattapan Renters Fear Eviction As New Rail Stops Drive Rent Increases',
    date: 'December 14, 2020',
  },
]

function buildSideData(seed) {
  const arr = Array.from({ length: PEOPLE_PER_SIDE }, (_, i) => i < Math.round(PEOPLE_PER_SIDE * RED_RATIO))
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (seed + i * 2654435761) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const LEFT_DATA = buildSideData(1)
const RIGHT_DATA = buildSideData(7)

function pickWaversNearEdge(data, count, side) {
  const COLS_ESTIMATE = 50
  const totalRows = Math.ceil(data.length / COLS_ESTIMATE)
  const midRow = Math.floor(totalRows / 2)
  const targetRows = [midRow - 3, midRow, midRow + 3].slice(0, count)
  const picked = []
  for (const row of targetRows) {
    const colTarget = side === 'left' ? COLS_ESTIMATE - 2 : 1
    let bestIdx = -1
    for (let c = colTarget; c >= 0 && c < COLS_ESTIMATE; c += (side === 'left' ? -1 : 1)) {
      const idx = row * COLS_ESTIMATE + c
      if (idx < data.length && data[idx]) { bestIdx = idx; break }
    }
    if (bestIdx === -1) {
      for (let c = colTarget; c >= 0 && c < COLS_ESTIMATE; c += (side === 'left' ? 1 : -1)) {
        const idx = row * COLS_ESTIMATE + c
        if (idx < data.length && data[idx]) { bestIdx = idx; break }
      }
    }
    if (bestIdx >= 0) picked.push(bestIdx)
  }
  return new Set(picked)
}

const LEFT_WAVERS = pickWaversNearEdge(LEFT_DATA, 2, 'left')
const RIGHT_WAVERS = pickWaversNearEdge(RIGHT_DATA, 1, 'right')

// Four "stations" on a stylized T line. Colors are official MBTA line
// colors: Orange (savings/value), Blue (jobs/Financial District),
// Red (errands -- the data is keyed to Harvard Square, on the Red Line),
// Green (planet). This is the Why-It-Matters interaction metaphor.
const STATIONS = [
  { id: 'savings', label: 'Cost Savings',  line: 'Orange', color: '#ED8B00' },
  { id: 'jobs',    label: 'Job Access',    line: 'Blue',   color: '#003DA5' },
  { id: 'errands', label: 'Daily Needs',   line: 'Red',    color: '#DA291C' },
  { id: 'planet',  label: 'Climate Impact', line: 'Green',  color: '#00843D' },
]

export default function ScrollyStory({ onComplete }) {
  const sectionsRef = useRef([])
  const mapSectionRef = useRef(null)
  const [needsStop, setNeedsStop] = useState(null)
  // Single source of truth for the "Why It Matters" T-line. The four
  // companion visualizations (cost panels, jobs panel, needs panel, trees)
  // are derived from which station the reader has selected -- but only
  // while the section itself is on screen, so they don't bleed into
  // adjacent sections after the reader scrolls past.
  const [activeStation, setActiveStation] = useState(null)
  const peopleSectionRef = useRef(null)
  const [mapOn, setMapOn] = useState(false)
  const costVisible = mapOn && activeStation === 'savings'
  const jobsVisible = mapOn && activeStation === 'jobs'
  const needsVisible = mapOn && activeStation === 'errands'
  const treesVisible = mapOn && activeStation === 'planet'
  const [peopleSectionOn, setPeopleSectionOn] = useState(false)
  const [activeQuote, setActiveQuote] = useState(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio >= 0.01) {
            entry.target.classList.add('revealed')
          }
        })
      },
      { threshold: [0, 0.01] }
    )

    sectionsRef.current.forEach((el) => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const mapEl = mapSectionRef.current
    const peopleEl = peopleSectionRef.current
    if (!mapEl) return

    const mapObs = new IntersectionObserver(
      ([entry]) => {
        setMapOn(entry.intersectionRatio >= 0.35)
      },
      { threshold: [0, 0.2, 0.35, 0.5], rootMargin: '-20% 0px -10% 0px' }
    )
    mapObs.observe(mapEl)

    const revealObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) mapEl.classList.add('revealed')
      },
      { threshold: 0.12 }
    )
    revealObs.observe(mapEl)

    let peopleObs
    if (peopleEl) {
      peopleObs = new IntersectionObserver(
        ([entry]) => {
          setPeopleSectionOn(entry.intersectionRatio >= 0.15)
        },
        { threshold: [0, 0.15] }
      )
      peopleObs.observe(peopleEl)
    }

    return () => {
      mapObs.disconnect()
      revealObs.disconnect()
      if (peopleObs) peopleObs.disconnect()
    }
  }, [])

  const quoteTimer = useRef(null)
  const quoteFadeTimer = useRef(null)
  const [quoteFading, setQuoteFading] = useState(false)

  const dismissQuote = () => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current)
    if (quoteFadeTimer.current) clearTimeout(quoteFadeTimer.current)
    setQuoteFading(true)
    quoteFadeTimer.current = setTimeout(() => {
      setActiveQuote(null)
      setQuoteFading(false)
    }, 600)
  }

  const handleWaverClick = (e, quoteIndex) => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current)
    if (quoteFadeTimer.current) clearTimeout(quoteFadeTimer.current)
    setQuoteFading(false)
    const rect = e.currentTarget.getBoundingClientRect()
    const isLeftHalf = rect.left < window.innerWidth / 2
    const bubbleH = 220
    const rawTop = rect.top + rect.height / 2
    const clampedTop = Math.max(bubbleH / 2 + 16, Math.min(rawTop, window.innerHeight - bubbleH / 2 - 16))
    setActiveQuote({
      ...QUOTES[quoteIndex],
      top: clampedTop,
      anchorX: isLeftHalf ? rect.right + 14 : rect.left - 14,
      side: isLeftHalf ? 'left' : 'right',
    })
    quoteTimer.current = setTimeout(() => {
      setQuoteFading(true)
      quoteFadeTimer.current = setTimeout(() => {
        setActiveQuote(null)
        setQuoteFading(false)
      }, 600)
    }, 4000)
  }

  useEffect(() => () => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current)
    if (quoteFadeTimer.current) clearTimeout(quoteFadeTimer.current)
  }, [])

  useEffect(() => {
    if (!activeQuote) return
    const handlePointerDown = (e) => {
      if (e.target.closest('.speech-bubble')) return
      if (e.target.closest('.person-waver')) return
      dismissQuote()
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') dismissQuote()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [activeQuote])

  const renderSideGrid = (data, wavers, quoteOffset) => {
    const waverArr = [...wavers]
    return (
      <div className="people-side-grid">
        {data.map((isRed, i) => {
          const waverLocalIdx = waverArr.indexOf(i)
          const isWaver = waverLocalIdx !== -1
          return (
            <svg
              key={i}
              viewBox="0 0 24 40"
              className={`person-tiny ${isWaver ? 'person-waver' : ''}`}
              fill={isRed ? '#DA291C' : '#c0bdb8'}
              onClick={isWaver ? (e) => handleWaverClick(e, quoteOffset + waverLocalIdx) : undefined}
              style={isWaver ? { cursor: 'pointer', pointerEvents: 'auto' } : undefined}
            >
              <circle cx="12" cy="6" r="5" />
              <path d="M12 14c-5 0-9 3-9 7v4h4v15h10V25h4v-4c0-4-4-7-9-7z" />
            </svg>
          )
        })}
      </div>
    )
  }

  const addRef = (i) => (el) => {
    sectionsRef.current[i] = el
  }

  return (
    <div className="scrolly">
      <div className={`trees-fixed ${treesVisible && mapOn ? 'trees-show' : ''}`} aria-hidden="true">
        {TREES.map((t, i) => (
          <img
            key={i}
            src={TREE_IMGS[i % TREE_IMGS.length]}
            className="tree-ground"
            style={{
              left: t.left,
              width: t.size,
              bottom: t.bottom,
              transitionDelay: `${i * 0.05}s`,
            }}
            alt=""
          />
        ))}
      </div>

      <div className={`cost-side-panels ${costVisible ? 'cost-show' : ''}`} aria-hidden="true">
        <div className="cost-panel cost-panel-left">
          <div className="cost-panel-amount">$1,000<span className="cost-panel-per">/month</span></div>
          <div className="cost-panel-bar">
            <div className="cost-segment cost-seg-parking" style={{'--seg-pct':'8%'}}><span>Parking $80</span></div>
            <div className="cost-segment cost-seg-maint"   style={{'--seg-pct':'10%'}}><span>Maintenance $99</span></div>
            <div className="cost-segment cost-seg-gas"     style={{'--seg-pct':'15%'}}><span>Gas $150</span></div>
            <div className="cost-segment cost-seg-insur"   style={{'--seg-pct':'18%'}}><span>Insurance $180</span></div>
            <div className="cost-segment cost-seg-payment" style={{'--seg-pct':'49%'}}><span>Car payment $491</span></div>
          </div>
          <div className="cost-panel-label">Driving</div>
          <div className="cost-panel-annual">$12,000 /year</div>
        </div>
        <div className="cost-panel cost-panel-right">
          <div className="cost-panel-amount">$90<span className="cost-panel-per">/month</span></div>
          <div className="cost-panel-bar">
            <div className="cost-segment cost-seg-transit" style={{'--seg-pct':'9%'}}><span>LinkPass $90</span></div>
          </div>
          <div className="cost-panel-label">MBTA</div>
          <div className="cost-panel-annual">$1,080 /year</div>
        </div>
      </div>

      <DailyNeedsPanel visible={needsVisible} onStopChange={setNeedsStop} />
      <JobAccessPanel visible={jobsVisible} />

      {/* Hero */}
      <div className="scrolly-hero">
        <video
          className="scrolly-hero-video"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src={`${import.meta.env.BASE_URL}hero-bg-480.webm`} type="video/webm" media="(max-width: 768px)" />
          <source src={`${import.meta.env.BASE_URL}hero-bg.webm`} type="video/webm" />
        </video>
        <div className="scrolly-hero-overlay" aria-hidden="true" />
        <p className="scrolly-hero-credit">
          Footage: Green Line train leaving Union Square Station, Somerville, by{' '}
          <a
            href="https://commons.wikimedia.org/wiki/File:Inbound_test_train_leaving_Union_Square_station,_January_2022.webm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Byron A. Nash
          </a>{' '}
          /{' '}
          <a
            href="https://creativecommons.org/licenses/by/2.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY 2.0
          </a>
        </p>
        <div className="scrolly-hero-kicker">
          <span className="scrolly-hero-kicker-dot" aria-hidden="true" />
          Greater Boston, 2026
        </div>
        <div className="scrolly-hero-content">
          <h1 className="scrolly-hero-title">
            <span className="scrolly-hero-title-line">Affordable Housing Near</span>
            <span className="scrolly-hero-title-accent">Transit</span>
          </h1>
          <p className="subtitle">
            How Massachusetts&rsquo; policies can come together
            to expand affordable homes near the MBTA.
          </p>
          <p className="scrolly-hero-authors">
            By Gabriela Miranda, Arnav Verma &amp; Hyemin (Helen) Bang
          </p>
        </div>
        <div className="scroll-hint">Scroll to explore ↓</div>
      </div>

      {/* Lede — first paragraph, paper background, sets up the rest */}
      <section className="scrolly-lede">
        <p className="scrolly-lede-text">
        For a renter in Greater Boston, the tradeoff is well known: the closer you live to a T stop, the more you pay. Transit means jobs, groceries, healthcare. A whole daily life without a car. But the neighborhoods with the best access are increasingly out of reach for the people who depend on transit most. This piece walks through what working-class renters near the MBTA face today, and where state policy has room to do more.
        </p>
      </section>

      {/* Section 1 · Why Transit Matters to You */}
      <div className="section-divider" />
      <section className="scrolly-section section-with-map" ref={mapSectionRef}>
        <div className="section-map-bg">
          <StoryMap />
        </div>
        <div className="section-map-tint" />
        <div className="section-content">
          <p>
          For a working-class renter, the nearest MBTA station shapes daily life: which jobs are reachable, which groceries and clinics are within walking distance, where a child's school sits relative to home. Station-adjacent housing is essential infrastructure for these households, and one of the highest-leverage places where state policy can support working families.
          </p>

          <div className="t-line" role="tablist" aria-label="Why your T stop matters">
            <div className="t-line-track">
              <span className="t-line-rail" aria-hidden="true" />
              {STATIONS.map((s) => {
                const isActive = activeStation === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="t-line-panel"
                    id={`t-line-tab-${s.id}`}
                    className={`t-line-stop${isActive ? ' t-line-stop-active' : ''}`}
                    style={{ '--station-color': s.color }}
                    onClick={() => setActiveStation(s.id)}
                  >
                    <span className="t-line-dot" aria-hidden="true" />
                    <span className="t-line-label">{s.label}</span>
                    <span className="t-line-line">{s.line} Line</span>
                  </button>
                )
              })}
            </div>

            <div
              id="t-line-panel"
              role="tabpanel"
              aria-labelledby={activeStation ? `t-line-tab-${activeStation}` : undefined}
              aria-label={!activeStation ? 'Why your T stop matters' : undefined}
              className="t-line-panel"
              style={{ '--station-color': STATIONS.find((s) => s.id === activeStation)?.color }}
            >
              {!activeStation && (
                <div className="t-line-prompt" role="status" aria-live="polite">
                  <p>
                  Select a stop to see what's at stake along each dimension: the costs avoided, the jobs reached, the daily errands made walkable, the climate impact reduced.
                  </p>
                </div>
              )}
              {activeStation === 'savings' && (
                <div className="t-line-content" key="savings">
                  <div className="t-line-content-eyebrow">Orange Line &middot; Cost Savings</div>
                  <div className="t-line-stat">
                    <span className="t-line-stat-num">$910</span>
                    <span className="t-line-stat-unit">/month, or $10,920/year</span>
                  </div>
                  <div className="t-line-stat-sub">
                    A car costs ~<strong>$1,000/month</strong> in Greater Boston;
                    an MBTA pass is <strong>$90</strong>. The roughly $900
                    monthly difference can absorb the higher rents found in
                    transit-adjacent neighborhoods, which is part of what makes
                    station access so valuable for working renters.
                  </div>
                  <div className="t-line-compare">
                    <div className="t-line-compare-row">
                      <span className="t-line-compare-label">Owning a car</span>
                      <span className="t-line-compare-bar">
                        <span className="t-line-compare-fill t-line-compare-fill-car" style={{ width: '100%' }} />
                      </span>
                      <span className="t-line-compare-val">$1,000/mo</span>
                    </div>
                    <div className="t-line-compare-row">
                      <span className="t-line-compare-label">MBTA pass</span>
                      <span className="t-line-compare-bar">
                        <span className="t-line-compare-fill t-line-compare-fill-mbta" style={{ width: '9%' }} />
                      </span>
                      <span className="t-line-compare-val">$90/mo</span>
                    </div>
                  </div>
                  <div className="t-line-source">
                    Data: AAA 2024 driving costs (Northeast) &amp; MBTA fare schedule
                  </div>
                </div>
              )}

              {activeStation === 'jobs' && (
                <div className="t-line-content" key="jobs">
                  <div className="t-line-content-eyebrow">Blue Line &middot; Job Access</div>
                  <div className="t-line-stat">
                    <span className="t-line-stat-num">4</span>
                    <span className="t-line-stat-unit">major job centers, all reachable on the T</span>
                  </div>
                  <div className="t-line-stat-sub">
                    Each sits within <strong>minutes on foot</strong> of a
                    station. Keeping station-adjacent housing reachable
                    preserves access to the region&rsquo;s largest employers for
                    working renters.
                  </div>
                  <div className="t-line-chips">
                    <span className="t-line-chip"><strong>Financial District</strong>State / Downtown Crossing</span>
                    <span className="t-line-chip"><strong>Kendall Square</strong>Kendall/MIT</span>
                    <span className="t-line-chip"><strong>Back Bay</strong>Back Bay</span>
                    <span className="t-line-chip"><strong>Longwood</strong>Longwood Medical Area</span>
                  </div>
                  <div className="t-line-source">
                    Data: MBTA station locations &amp; BLS employment estimates
                  </div>
                </div>
              )}

              {activeStation === 'errands' && (
                <div className="t-line-content" key="errands">
                  <div className="t-line-content-eyebrow">Red Line &middot; Daily Needs</div>
                  <div className="t-line-stat">
                    <span className="t-line-stat-num">{needsStop?.total || '150+'}</span>
                    <span className="t-line-stat-unit">daily-need destinations within a 10-minute walk</span>
                  </div>
                  <div className="t-line-stat-note">
                    * Daily-need destinations are the everyday services: <br />groceries, food and cafés, health clinics,
                    pharmacies, schools, libraries, parks, fitness, and banks
                    and post offices.
                  </div>
                  <div className="t-line-stat-sub">
                    Near <strong>{needsStop?.name || 'Harvard Square'}</strong>,
                    each sits within a short walk. Maintaining station-adjacent
                    housing keeps these services within reach for the renters
                    who depend on them.
                  </div>
                  <div className="t-line-source">
                    Data: OpenStreetMap amenities, 800m radius
                  </div>
                </div>
              )}

              {activeStation === 'planet' && (
                <div className="t-line-content" key="planet">
                  <div className="t-line-content-eyebrow">Green Line &middot; Climate Impact</div>
                  <div className="t-line-stat">
                    <span className="t-line-stat-num">&minus;53%</span>
                    <span className="t-line-stat-unit">CO&#8322; vs driving</span>
                  </div>
                  <div className="t-line-stat-sub">
                    Each transit commute saves about <strong>283 kg CO&#8322;</strong>
                    per year, roughly the climate benefit of planting{' '}
                    <strong>13 trees</strong>.
                  </div>
                  <div className="t-line-source-context">5-mile commute, round trip, 250 days/year</div>
                  <div className="t-line-compare">
                    <div className="t-line-compare-row">
                      <span className="t-line-compare-label">Driving</span>
                      <span className="t-line-compare-bar">
                        <span className="t-line-compare-fill t-line-compare-fill-car" style={{ width: '100%' }} />
                      </span>
                      <span className="t-line-compare-val">533 kg/yr</span>
                    </div>
                    <div className="t-line-compare-row">
                      <span className="t-line-compare-label">MBTA</span>
                      <span className="t-line-compare-bar">
                        <span className="t-line-compare-fill t-line-compare-fill-mbta" style={{ width: '47%' }} />
                      </span>
                      <span className="t-line-compare-val">250 kg/yr</span>
                    </div>
                  </div>
                  <div className="t-line-source">
                    Data: CBO &amp; Our World in Data, per-passenger-mile estimates
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* Section 2 · Policy Context (with affordability-gap people background) */}
      <div className="section-divider" />
      <section
        className={`scrolly-section scrolly-section-wide policy-section-editorial section-with-people ${!mapOn && peopleSectionOn ? 'people-visible' : ''}`}
        ref={(el) => {
          sectionsRef.current[2] = el
          peopleSectionRef.current = el
        }}
      >
        <div className="people-sides">
          <div className="people-side people-side-left">{renderSideGrid(LEFT_DATA, LEFT_WAVERS, 0)}</div>
          <div className="people-side people-side-right">{renderSideGrid(RIGHT_DATA, RIGHT_WAVERS, 2)}</div>
          <div className="people-source">
            Sources: ACS 2023 DP03 household income distribution for Greater
            Boston tracts; threshold from $2,300/mo rent at the 30% rule.
          </div>
        </div>
        {activeQuote && (
          <div
            className={`speech-bubble speech-bubble-${activeQuote.side}${quoteFading ? ' speech-fading' : ''}`}
            style={{
              top: `${activeQuote.top}px`,
              ...(activeQuote.side === 'left'
                ? { left: `${activeQuote.anchorX}px` }
                : { right: `${window.innerWidth - activeQuote.anchorX}px` }),
            }}
          >
            <div className="speech-text">{activeQuote.text}</div>
            <div className="speech-name">{activeQuote.name}</div>
            <div className="speech-area">{activeQuote.area}</div>
            <div className="speech-source">
              {activeQuote.source}, <em>{activeQuote.sourceTitle}</em> ({activeQuote.date})
            </div>
          </div>
        )}
        <div className="policy-section-inner">
          <p className="policy-people-hint" role="note">
            Click a waving figure at the left or right to read what Boston-area
            residents have said in local news about housing and transit.
          </p>
          <div className="policy-section-opener-card">
            <p className="policy-section-opener">
              Housing is considered affordable when rent takes up no more than
              30% of household income. So, a household needs
              roughly <strong>$92,000 a year</strong> to afford the average
              apartment near an MBTA station. About{' '}
              <strong>4 in 10 Greater Boston households</strong> earn less.
            </p>
            <p className="policy-section-opener-source">
              Sources:{' '}
            <a
              href="https://www.hud.gov/program_offices/comm_planning/affordablehousing"
              target="_blank"
              rel="noopener noreferrer"
            >
              HUD affordability standard (30% rent-to-income rule)
            </a>
            {' · '}
            <a
              href="https://data.census.gov/table/ACSDP5Y2023.DP04"
              target="_blank"
              rel="noopener noreferrer"
            >
              median gross rent, ACS 2023 5-yr (DP04)
            </a>
            {' · '}
            <a
              href="https://data.census.gov/table/ACSDP5Y2023.DP03"
              target="_blank"
              rel="noopener noreferrer"
            >
              household income distribution, ACS 2023 5-yr (DP03)
            </a>
            . Computed for Greater Boston census tracts within walking
            distance of an MBTA station.
            </p>
          </div>
        </div>
      </section>

      {/* Section 3 · Of every 100 new homes (waffle) */}
      <div className="section-divider" />
      <section className="scrolly-section" ref={addRef(3)}>
        <MotivationPanels view="waffle" />
      </section>

      {/* Section 4 · The people who keep Boston running (occupations) */}
      <div className="section-divider" />
      <section className="scrolly-section" ref={addRef(4)}>
        <MotivationPanels view="occupations" />
      </section>

      {/* Section 5 · Pick a worker */}
      <div className="section-divider" />
      <section className="scrolly-section" ref={addRef(5)}>
        <PolicyGapPanels view="workers" />
      </section>

      {/* Section 6 · Two Landmark Laws · Venn Diagram */}
      <div className="section-divider" />
      <section className="scrolly-section" ref={addRef(6)}>
        <header className="venn-section-header">
          <h3 className="venn-section-title">
            Two state housing laws shape <br />what gets built near MBTA stations.
          </h3>
          <p className="venn-section-dek">
            Hover each circle to see what each law does, and where they
            don&rsquo;t quite meet.
          </p>
        </header>
        <PolicyVenn />
      </section>

      {/* Section 7 · Bridge paragraph + policy levers */}
      <div className="section-divider" />
      <section className="scrolly-section" ref={addRef(7)}>
        <p className="policy-section-bridge">
          Both laws control <em>where</em> housing gets built and{' '}
          <em>how much</em> money flows to it. Neither controls{' '}
          <em>who gets to live there</em>. That&rsquo;s the gap shown above:
          density without affordability, capacity without keys for working
          renters.
        </p>
        <PolicyGapPanels view="levers" />
      </section>

      {/* Transition · narrative + visuals → personal interactive explorer */}
      <section className="scrolly-bridge" aria-hidden="false">
        <div className="scrolly-bridge-inner">
          <p className="scrolly-bridge-text">
            Up to here, a shared view of law, supply, and a few example workers. 
            What follows lets you sit with the choice that any one renter has to make: 
            the rent they can carry, the commute they can absorb, the tradeoffs they end up living with. <br /> <br />
            From the story to <em>one renter's</em> map.
          </p>
          <div className="scrolly-bridge-rule" />
        </div>
      </section>

      {/* Section 9 · Conclusion / transition (full viewport, centered) */}
      <section className="scrolly-section scrolly-cta" ref={addRef(9)}>
        <div className="scrolly-cta-inner">
          <h2>The Tradeoffs Are Personal</h2>
          <p className="scrolly-cta-lead">
          For any one renter, the right tradeoff depends on income, workplace, and priorities. How far is the commute they can absorb? What share of income can go to rent? Is a car worth the cost if it buys a cheaper apartment further out?
          </p>
          <p className="scrolly-cta-sub">
          Use the explorer to step through the decision a Greater Boston renter is making right now.
          </p>
          <button type="button" onClick={onComplete}>
            Start Exploring
          </button>
        </div>
      </section>
      <KeyTermsButton />
    </div>
  )
}
