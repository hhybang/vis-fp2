import { useEffect, useRef, useState } from 'react'
import StoryMap from './StoryMap'
import DailyNeedsPanel from './DailyNeedsPanel'
import JobAccessPanel from './JobAccessPanel'
import MotivationPanels from './MotivationPanels'
import PolicyGapPanels from './PolicyGapPanels'
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
  { left: '-1%',  size: 300, bottom: 0 },
  { left: '10%',  size: 180, bottom: 0 },
  { left: '19%', size: 200, bottom: 0 },
  { left: '16%', size: 120, bottom: 0 },
  { left: '7%', size: 130, bottom: 0 },
  { left: '19%', size: 90, bottom: 0 },
  { left: '14%', size: 85, bottom: 0 },
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

export default function ScrollyStory({ onComplete }) {
  const sectionsRef = useRef([])
  const mapSectionRef = useRef(null)
  const [treesVisible, setTreesVisible] = useState(false)
  const [costVisible, setCostVisible] = useState(false)
  const [needsVisible, setNeedsVisible] = useState(false)
  const [needsStop, setNeedsStop] = useState(null)
  const [jobsVisible, setJobsVisible] = useState(false)
  const peopleSectionRef = useRef(null)
  const [mapOn, setMapOn] = useState(false)
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
        const on = entry.intersectionRatio >= 0.15
        if (on) {
          mapEl.classList.add('map-visible')
        } else {
          mapEl.classList.remove('map-visible')
        }
        setMapOn(on)
      },
      { threshold: [0, 0.15] }
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
  const [quoteFading, setQuoteFading] = useState(false)

  const handleWaverClick = (e, quoteIndex) => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current)
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
      setTimeout(() => { setActiveQuote(null); setQuoteFading(false) }, 600)
    }, 4000)
  }

  useEffect(() => () => { if (quoteTimer.current) clearTimeout(quoteTimer.current) }, [])

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
      <div className={`trees-fixed ${treesVisible ? 'trees-show' : ''}`} aria-hidden="true">
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
        <div className="scrolly-hero-content">
          <h1 className="scrolly-hero-title">
            <span className="scrolly-hero-title-line">Housing Near</span>
            <span className="scrolly-hero-title-accent">Transit</span>
          </h1>
          <p className="subtitle">
            Why the apartments near your T stop keep getting more expensive,
            and what&rsquo;s not being done about it
          </p>
          <p className="scrolly-hero-authors">
            Gabriela Miranda, Arnav Verma, Helen Bang
          </p>
          <p className="intro">
            If you rent in Greater Boston, you already know the tradeoff: the
            closer you live to a T stop, the more you pay. Transit means
            jobs, groceries, healthcare, your whole daily life without
            a car. But the neighborhoods with the best access are
            increasingly out of reach for the people who depend on it most.
            This is the story of how that happened, what the state promised
            to do about it, and what it means for you.
          </p>
        </div>
        <div className="scroll-hint">Scroll to explore ↓</div>
      </div>

      {/* Renter voices, surfaced early so the audience hears real people first */}
      <section className="renter-voices" ref={addRef(0)}>
        <div className="renter-voices-inner">
          {QUOTES.map((q, i) => (
            <blockquote key={i} className="renter-voice-card">
              <p className="renter-voice-text">{q.text}</p>
              <footer className="renter-voice-attr">
                <span className="renter-voice-name">{q.name}</span>
                <span className="renter-voice-area">{q.area}</span>
                <cite className="renter-voice-source">
                  {q.source}, <em>{q.sourceTitle}</em> ({q.date})
                </cite>
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      {/* Section 1 · Why Transit Matters to You */}
      <div className="section-divider" />
      <section className="scrolly-section section-with-map" ref={mapSectionRef}>
        <div className="section-map-bg">
          <StoryMap />
        </div>
        <div className="section-map-tint" />
        <div className="section-content">
          <span className="section-eyebrow">Why It Matters</span>
          <h2>Your T Stop Is More Than a Commute</h2>
          <p>
            If you don&rsquo;t own a car, or can&rsquo;t afford one,
            your nearest transit stop shapes everything: which jobs you can get
            to, where you buy groceries, how you reach a doctor. Living close
            to a station isn&rsquo;t a luxury. For many renters in Greater
            Boston, it&rsquo;s the infrastructure that makes daily life work.
          </p>

          <div className="hover-hint">Hover over each card to explore</div>
          <div className="benefit-cards">
            <div
              className="benefit-card benefit-card-expandable"
              onMouseEnter={() => setCostVisible(true)}
              onMouseLeave={() => setCostVisible(false)}
            >
              <div className="benefit-icon">$</div>
              <div className="benefit-title">Your Savings</div>
              <div className="benefit-desc">
                A car costs you ~$1,000/month in Greater Boston. An MBTA pass
                is $90. That gap is rent money.
              </div>
              <div className="benefit-expand">
                <div className="expand-saving">
                  Without a car, you keep <strong>$910/month</strong>, or{' '}
                  <strong>$10,920/year</strong>, that can go toward rent instead
                  of a car payment.
                </div>
                <div className="expand-source">
                  Data: AAA 2024 driving costs (Northeast) &amp; MBTA fare schedule
                </div>
              </div>
            </div>
            <div
              className="benefit-card benefit-card-expandable"
              onMouseEnter={() => setJobsVisible(true)}
              onMouseLeave={() => setJobsVisible(false)}
            >
              <div className="benefit-icon">&#9719;</div>
              <div className="benefit-title">Your Job Options</div>
              <div className="benefit-desc">
                Living near a T stop puts you within reach of the region&rsquo;s
                biggest job centers, without needing a car to get there.
              </div>
              <div className="benefit-expand">
                <div className="expand-saving">
                  The Financial District, Kendall Square, Back Bay, Longwood:
                  each is just <strong>minutes on foot</strong> from
                  a T station. Move away from transit and those commutes get
                  longer, costlier, or impossible.
                </div>
                <div className="expand-source">
                  Data: MBTA station locations &amp; BLS employment estimates
                </div>
              </div>
            </div>
            <div
              className="benefit-card benefit-card-expandable"
              onMouseEnter={() => setNeedsVisible(true)}
              onMouseLeave={() => setNeedsVisible(false)}
            >
              <div className="benefit-icon">&#9878;</div>
              <div className="benefit-title">Your Daily Errands</div>
              <div className="benefit-desc">
                Groceries, a clinic, your kid&rsquo;s school: near a T
                stop, these are a walk away. Further out, each errand becomes a
                trip.
              </div>
              <div className="benefit-expand">
                <div className="expand-saving">
                  Near <strong>{needsStop?.name || 'Harvard Square'}</strong>, there are{' '}
                  <strong>{needsStop?.total || '150+'} daily-need destinations</strong> within
                  a 10-minute walk. That&rsquo;s the kind of access you lose
                  when you&rsquo;re priced out of a transit neighborhood.
                </div>
                <div className="expand-source">
                  Data: OpenStreetMap amenities, 800m radius
                </div>
              </div>
            </div>
            <div
              className="benefit-card benefit-card-expandable"
              onMouseEnter={() => setTreesVisible(true)}
              onMouseLeave={() => setTreesVisible(false)}
            >
              <div className="benefit-icon">&#9729;</div>
              <div className="benefit-title">The Planet, Too</div>
              <div className="benefit-desc">
                Taking the T instead of driving cuts your transportation
                emissions by more than half.
              </div>
              <div className="benefit-expand">
                <div className="expand-label">5-mile commute, round trip, 250 days/year</div>
                <div className="expand-compare">
                  <div className="expand-mode">
                    <div className="expand-mode-name">Driving</div>
                    <div className="expand-bar-track">
                      <div className="expand-bar" style={{ width: '100%', background: '#8b4a4a' }} />
                    </div>
                    <div className="expand-value">533 kg CO&#8322;/yr</div>
                  </div>
                  <div className="expand-mode">
                    <div className="expand-mode-name">MBTA</div>
                    <div className="expand-bar-track">
                      <div className="expand-bar" style={{ width: '47%', background: '#00843D' }} />
                    </div>
                    <div className="expand-value">250 kg CO&#8322;/yr</div>
                  </div>
                </div>
                <div className="expand-saving">
                  Switching saves <strong>283 kg CO&#8322;</strong> per year, about
                  the same climate benefit as planting 13 trees.
                </div>
                <div className="expand-source">
                  Data: CBO &amp; Our World in Data, per-passenger-mile estimates
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Section 2 · Background: Affordability Gap */}
      <div className="section-divider" />
      <section className={`scrolly-section section-with-people ${!mapOn && peopleSectionOn ? 'people-visible' : ''}`} ref={peopleSectionRef}>
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
        <div className="section-content revealed">
          <span className="section-eyebrow">The Squeeze</span>
          <h2>The Closer to Transit, the Higher Your Rent</h2>
          <p>
            Every time a new station opens or a line improves, the apartments
            nearby get more expensive. It&rsquo;s not a mystery: better
            transit makes a neighborhood more desirable, and landlords price
            accordingly. Rents near MBTA stations have been climbing faster
            than rents everywhere else.
          </p>

          <div className="stat-row">
            <div className="stat-block">
              <div className="stat-number">$2,300</div>
              <div className="stat-desc">
                Average monthly rent near MBTA stations in Greater Boston
              </div>
            </div>
            <div className="stat-block">
              <div className="stat-number">30%</div>
              <div className="stat-desc">
                Share of income recommended for housing costs
              </div>
            </div>
            <div className="stat-block">
              <div className="stat-number">$92,000</div>
              <div className="stat-desc">
                Minimum annual income to afford that rent at 30%
              </div>
            </div>
          </div>

          <p className="section-note">
            If you earn less than $92,000 a year, a typical apartment near an
            MBTA station would eat more than 30% of your income. That&rsquo;s
            the textbook definition of being &ldquo;cost-burdened.&rdquo;
            Roughly <strong>4 in 10 households</strong> in Greater Boston fall
            below that line.
          </p>
          <p>
            You&rsquo;re not imagining the squeeze. The gap between where you
            can afford to live and where the T can take you is real, and
            it&rsquo;s growing.
          </p>
        </div>
      </section>

      {/* Section 3 · Policy Context */}
      <div className="section-divider" />
      <section className="scrolly-section scrolly-section-wide policy-section-editorial" ref={addRef(2)}>
        <div className="policy-section-inner">
          <header className="policy-section-header">
            <span className="section-eyebrow">What the State Promised</span>
            <h2>Two Big Laws. Neither Guarantees You a Home.</h2>
            <p className="policy-section-lead">
              Massachusetts passed two landmark housing policies, the
              most ambitious in state history. They sound like good news for
              renters. Look closer.
            </p>
          </header>

          <div className="policy-stack" role="list">
            {/* Card 1: MBTA Communities Act */}
            <article className="policy-card-v2" role="listitem">
              <div className="policy-header">
                <div className="policy-icon">
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="6" y="14" width="36" height="28" rx="3" />
                    <path d="M16 14V8a8 8 0 0 1 16 0v6" />
                    <circle cx="24" cy="28" r="4" />
                    <path d="M24 32v4" />
                  </svg>
                </div>
                <div>
                  <span className="policy-year">2021</span>
                  <h3>MBTA Communities Act</h3>
                  <p className="policy-card-dek">
                    Zoning reform that opens station areas to denser housing.
                  </p>
                </div>
              </div>

              <div className="policy-stat-banner">
                <div className="policy-stat">
                  <span className="policy-stat-num">177</span>
                  <span className="policy-stat-label">communities affected</span>
                </div>
              </div>

              <div className="policy-body policy-body-split">
                <div className="policy-does">
                  <span className="policy-tag policy-tag-does">What it does</span>
                  <p>
                    Requires MBTA-served communities to zone for multi-family
                    housing near transit stations, removing decades of exclusionary
                    single-family-only zoning that restricted where people could live.
                  </p>
                </div>
                <div className="policy-misses">
                  <span className="policy-tag policy-tag-misses">What it means for you</span>
                  <p>
                    The law mandates <em>zoning</em>, not construction, and
                    sets <strong>no income targets</strong>. Every new building
                    near your station can be entirely market-rate. More
                    apartments, same unaffordable rents.
                  </p>
                </div>
              </div>

              <a
                className="policy-source-link"
                href="https://www.mass.gov/info-details/multi-family-zoning-requirement-for-mbta-communities"
                target="_blank"
                rel="noopener noreferrer"
              >
                Mass.gov: Multi-Family Zoning Requirement &rarr;
              </a>
            </article>

            {/* Card 2: Affordable Homes Act */}
            <article className="policy-card-v2" role="listitem">
              <div className="policy-header">
                <div className="policy-icon">
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 22L24 8l18 14" />
                    <path d="M10 20v18h10V28h8v10h10V20" />
                    <path d="M24 28v6" />
                  </svg>
                </div>
                <div>
                  <span className="policy-year">2024</span>
                  <h3>Affordable Homes Act</h3>
                  <p className="policy-card-dek">
                    Historic public investment in housing production and preservation.
                  </p>
                </div>
              </div>

              <div className="policy-stat-banner">
                <div className="policy-stat">
                  <span className="policy-stat-num">$5.4B</span>
                  <span className="policy-stat-label">housing investment</span>
                </div>
              </div>

              <div className="policy-body policy-body-split">
                <div className="policy-does">
                  <span className="policy-tag policy-tag-does">What it does</span>
                  <p>
                    The largest housing bond in state history. Funds production,
                    preservation, and stabilization across Massachusetts, with
                    programs for smart growth and livable communities near transit.
                  </p>
                </div>
                <div className="policy-misses">
                  <span className="policy-tag policy-tag-misses">What it means for you</span>
                  <p>
                    $5.4 billion sounds like a lot. But nothing in the law says
                    that money has to produce <strong>affordable units</strong>{' '}
                    near your station. The funding goes statewide. Affordability
                    near transit is encouraged, not required.
                  </p>
                </div>
              </div>

              <a
                className="policy-source-link"
                href="https://www.mass.gov/info-details/the-affordable-homes-act-smart-housing-livable-communities"
                target="_blank"
                rel="noopener noreferrer"
              >
                Mass.gov: Affordable Homes Act &rarr;
              </a>
            </article>
          </div>

          <div className="policy-takeaway">
            <p className="policy-takeaway-intro">
              Both laws move in the right direction. But if you&rsquo;re a renter
              watching new buildings go up near your stop, the bottom line is:
            </p>
            <p className="policy-quote policy-quote--synthesis">
              More housing near transit does not mean housing
              <em> you</em> can afford near transit.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4 · Motivation */}
      <div className="section-divider" />
      <section className="scrolly-section" ref={addRef(3)}>
        <span className="section-eyebrow">Who Actually Gets In</span>
        <h2>So Who Is the New Housing For?</h2>

        <MotivationPanels />

        <p>
          The pattern is clear: the stations with the best service, the
          ones you depend on most, are surrounded by the most
          market-rate housing. The new buildings going up near your Red Line
          or Orange Line stop are overwhelmingly not priced for you. They&rsquo;re
          priced for someone earning twice what you do.
        </p>
      </section>

      {/* Section 5 · Analysis: What's Missing */}
      <div className="section-divider" />
      <section className="scrolly-section" ref={addRef(4)}>
        <span className="section-eyebrow">The Missing Piece</span>
        <h2>Why Nobody Required Affordable Units</h2>
        <p>
          Both laws control <em>where</em> housing gets built and <em>how
          much</em> money flows to it. Neither controls{' '}
          <em>who gets to live there</em>.
        </p>

        <PolicyGapPanels />

        <p>
          Other states have figured this out. Washington now requires affordable
          units in every development near a transit station. California
          fast-tracks projects that include them. Massachusetts has the zoning
          and the money. What it&rsquo;s still missing is the rule that
          says some of those new apartments near your stop have to be ones you
          can actually sign a lease on.
        </p>
      </section>

      {/* Transition · systemic gap → personal calculus */}
      <section className="scrolly-bridge" aria-hidden="false">
        <div className="scrolly-bridge-inner">
          <span className="scrolly-bridge-eyebrow">In the Meantime</span>
          <p className="scrolly-bridge-text">
            Policy change is slow. And while legislators debate, you&rsquo;re
            the one making the tradeoffs:{' '}
            <em>one budget, one commute, one lease at a time</em>.
          </p>
          <div className="scrolly-bridge-rule" />
          <p className="scrolly-bridge-cue">So what does the map look like for you?</p>
        </div>
      </section>

      {/* Section 6 · Conclusion / transition (full viewport, centered) */}
      <section className="scrolly-section scrolly-cta" ref={addRef(5)}>
        <div className="scrolly-cta-inner">
          <span className="section-eyebrow">Explore</span>
          <h2>The Tradeoffs Are Personal</h2>
          <p className="scrolly-cta-lead">
            The right tradeoff depends on your situation: your income, your
            workplace, your priorities. How far are you willing to commute?
            What can you afford to spend on housing? Is a car worth the cost
            if it means a cheaper apartment further out?
          </p>
          <p className="scrolly-cta-sub">
            Use the interactive explorer to test what transit-oriented housing
            looks like for you.
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
