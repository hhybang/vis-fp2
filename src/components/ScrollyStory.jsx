import { useEffect, useRef, useState } from 'react'
import StoryMap from './StoryMap'
import DailyNeedsPanel from './DailyNeedsPanel'
import JobAccessPanel from './JobAccessPanel'
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
            Access, affordability, and the policies that shape both
          </p>
          <p className="scrolly-hero-authors">
            Gabriela Miranda, Arnav Verma, Helen Bang
          </p>
          <p className="intro">
            In Greater Boston, living near public transit opens doors to jobs,
            services, and opportunity. But as demand for transit-accessible
            neighborhoods grows, so does the question: who can afford to live
            there?
          </p>
        </div>
        <div className="scroll-hint">Scroll to explore ↓</div>
      </div>

      {/* Section 1 · Background: Why Transit Matters */}
      <div className="section-divider" />
      <section className="scrolly-section section-with-map" ref={mapSectionRef}>
        <div className="section-map-bg">
          <StoryMap />
        </div>
        <div className="section-map-tint" />
        <div className="section-content">
          <span className="section-eyebrow">Background</span>
          <h2>Access Starts With Transit</h2>
          <p>
            Public transit is more than a way to get to work. It connects people
            to healthcare, education, grocery stores, and community. For
            households without a car, transit access can define the boundaries of
            daily life.
          </p>

          <div className="hover-hint">Hover over each card to explore</div>
          <div className="benefit-cards">
            <div
              className="benefit-card benefit-card-expandable"
              onMouseEnter={() => setCostVisible(true)}
              onMouseLeave={() => setCostVisible(false)}
            >
              <div className="benefit-icon">$</div>
              <div className="benefit-title">Lower Cost</div>
              <div className="benefit-desc">
                An MBTA pass costs ~$90/month. Car ownership averages over
                $1,000/month in Greater Boston.
              </div>
              <div className="benefit-expand">
                <div className="expand-saving">
                  Switching saves <strong>$910/month</strong>. That&rsquo;s{' '}
                  <strong>$10,920/year</strong> back in your pocket.
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
              <div className="benefit-title">Job Access</div>
              <div className="benefit-desc">
                Boston&rsquo;s transit network connects riders to major employment
                centers across 175 municipalities.
              </div>
              <div className="benefit-expand">
                <div className="expand-saving">
                  Boston&rsquo;s biggest employment hubs (Financial District,
                  Kendall Square, Back Bay, Longwood) are each just{' '}
                  <strong>minutes on foot</strong> from a T station.
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
              <div className="benefit-title">Daily Needs</div>
              <div className="benefit-desc">
                Groceries, healthcare, schools, and parks are all more accessible
                within a short walk of a transit stop.
              </div>
              <div className="benefit-expand">
                <div className="expand-saving">
                  Near <strong>{needsStop?.name || 'Harvard Square'}</strong>, there are{' '}
                  <strong>{needsStop?.total || '150+'} daily-need destinations</strong> within
                  a 10-minute walk, from groceries to clinics to parks.
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
              <div className="benefit-title">Less Emissions</div>
              <div className="benefit-desc">
                Switching from driving to transit can cut a household&rsquo;s
                transportation emissions by over 50%.
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

          <p>
            In the Greater Boston area, the MBTA network (subway, commuter rail,
            bus, and light rail) serves as the backbone of regional mobility.
          </p>

          <p>
            But transit access is not evenly distributed. Some neighborhoods have
            stations every few blocks; others have none at all. And where transit
            does exist, living nearby comes at a premium.
          </p>
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
          <span className="section-eyebrow">Background</span>
          <h2>Access Is Not Equally Affordable</h2>
          <p>
            As cities invest in transit infrastructure, the neighborhoods around
            stations become more desirable, and more expensive.
            Research consistently shows that housing costs near transit tend to
            rise faster than in less-connected areas.
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
            In the Greater Boston area, an estimated <strong>59.5%</strong> of
            households earn above that threshold. That means roughly
            <strong> 4 in 10 households</strong> fall below the income needed to
            afford a typical transit-adjacent rent without becoming cost-burdened.
          </p>
          <p>
            This creates a paradox: the people who would benefit most from
            transit access are often lower-income households who are less likely
            to own cars, yet they are often priced out of the neighborhoods
            where that access exists.
          </p>
          <p>
            The result is a growing disconnect between where affordable housing
            is needed and where it is being built.
          </p>
        </div>
      </section>

      {/* Section 3 · Policy Context */}
      <div className="section-divider" />
      <section className="scrolly-section scrolly-section-wide policy-section-editorial" ref={addRef(2)}>
        <div className="policy-section-inner">
          <header className="policy-section-header">
            <span className="section-eyebrow">Policy Context</span>
            <h2>What Massachusetts Is Doing</h2>
            <p className="policy-section-lead">
              The state has responded with two landmark policies. Together they
              represent the most ambitious push for transit-oriented housing in
              Massachusetts history, but each has a critical blind spot.
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
                  <span className="policy-tag policy-tag-misses">What it misses</span>
                  <p>
                    The law mandates <em>zoning</em>, not construction, and
                    critically, it sets <strong>no income targets</strong>. New
                    housing can be entirely market-rate, leaving lower-income
                    residents no better off.
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
                  <span className="policy-tag policy-tag-misses">What it misses</span>
                  <p>
                    Despite the scale, the Act does not mandate that developments
                    near stations include <strong>affordable units</strong>.
                    Funding flows to projects statewide. Transit-adjacent
                    affordability is encouraged, not ensured.
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
              Both policies move in the right direction. But neither fully
              addresses the core tension:
            </p>
            <p className="policy-quote policy-quote--synthesis">
              More housing near transit does not automatically mean
              <em> affordable</em> housing near transit.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4 · Motivation (scaffold) */}
      <div className="section-divider" />
      <section className="scrolly-section" ref={addRef(3)}>
        <span className="section-eyebrow">Motivation</span>
        <h2>But Who Benefits?</h2>
        <p>
          More housing near transit can improve access for many. But does it
          reach the people who need it most? And what are the tradeoffs for
          those who already live in these neighborhoods?
        </p>

        <div className="scaffold-placeholder">
          <div className="scaffold-label">Section content (to be completed)</div>
          <div className="scaffold-desc">
            This section will examine who current TOD housing actually serves,
            including visualizations of affordability gaps and displacement
            risks.
          </div>
        </div>
        <div className="scaffold-placeholder">
          <div className="scaffold-label">Visualization placeholder</div>
          <div className="scaffold-desc">
            Visualization(s) showing the downside of current TOD patterns for
            existing residents.
          </div>
        </div>
      </section>

      {/* Section 5 · Body (scaffold) */}
      <div className="section-divider" />
      <section className="scrolly-section" ref={addRef(4)}>
        <span className="section-eyebrow">Analysis</span>
        <h2>What&rsquo;s Missing?</h2>
        <p>
          If transit-oriented development alone doesn&rsquo;t guarantee
          affordability, what additional policies or design approaches are
          needed?
        </p>

        <div className="scaffold-placeholder">
          <div className="scaffold-label">Section content (to be completed)</div>
          <div className="scaffold-desc">
            This section will analyze what existing TOD housing policies lack
            and what benefits they do provide, with supporting visualizations.
          </div>
        </div>
        <div className="scaffold-placeholder">
          <div className="scaffold-label">Visualization placeholder</div>
          <div className="scaffold-desc">
            Visualization(s) illustrating the benefits of existing policies and
            the gaps that remain.
          </div>
        </div>
      </section>

      {/* Section 6 · Conclusion / transition (full viewport, centered) */}
      <section className="scrolly-section scrolly-cta" ref={addRef(5)}>
        <div className="scrolly-cta-inner">
          <span className="section-eyebrow">Explore</span>
          <h2>The Tradeoffs Are Personal</h2>
          <p className="scrolly-cta-lead">
            Policies shape the landscape of housing options. But the right
            tradeoff depends on your situation: your income, your workplace,
            your priorities. How far are you willing to commute? What can you
            afford to spend on housing? Is a car worth the cost if it means a
            cheaper apartment further out?
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
    </div>
  )
}
