import { useState, useCallback } from 'react'

// Visual takeaway for the policy section.
//
// Two large color-coded circles for Massachusetts' two landmark housing
// laws. Each lobe shows year + law name + a single-word keyword
// (ZONING / FUNDING) hinting at what the law actually does. The
// intersection — affordable housing near transit — is the gap, but it
// is *hidden by default*: the lens only fades in after the reader has
// hovered both laws, turning the diagram into a small act of discovery.
//
// Each region is also a hover/focus target; hovering reveals a detail
// panel below the SVG with extra context and sources. The panel
// persists while the pointer is anywhere inside the figure (so users
// can mouse onto a source link), and resets when pointer/focus leaves.
//
// Geometry: viewBox 800x540, circles r=240 centered at (280, 270) and
// (520, 270). Lens crosses at y≈62 and y≈478. Side-circle text is
// centered at x=160 / x=640 (middle of each non-overlap zone). Lens
// text is centered at x=400.

const DETAILS = {
  left: {
    color: '#003DA5',
    eyebrow: '2021 · Zoning',
    title: 'MBTA Communities Act',
    body:
      'Section 3A of Chapter 40A requires the 177 cities and towns served by the MBTA to designate at least one zoning district where multi-family housing is permitted by right, sized to community type and proximity to transit. The law expands what can be built near stations, but does not itself require the new units to be income-restricted.',
    sourceLabel: 'Mass.gov · Multi-Family Zoning Requirement for MBTA Communities',
    sourceHref:
      'https://www.mass.gov/info-details/multi-family-zoning-requirement-for-mbta-communities',
  },
  right: {
    color: '#00843D',
    eyebrow: '2024 · Funding',
    title: 'Affordable Homes Act',
    body:
      'A $5.4 billion housing bond bill funding production, preservation, rental assistance, and public housing modernization across Massachusetts. The law expands the state\'s capacity to build and preserve affordable homes, but its funding is allocated statewide rather than tied to MBTA station areas.',
    sourceLabel: 'Mass.gov · Affordable Homes Act',
    sourceHref: 'https://www.mass.gov/info-details/affordable-homes-act',
  },
  mid: {
    color: '#DA291C',
    eyebrow: 'The Gap',
    title: 'Affordable housing near transit',
    body:
      'The two laws together expand zoning capacity near stations and expand statewide funding for affordable housing. Neither, however, specifically requires that the new transit-adjacent housing be income-restricted, or that the new affordable funding be deployed near transit. Closing this overlap would tie zoning reform to dedicated affordable production where access to jobs, services, and transit is greatest.',
    sourceLabel: null,
    sourceHref: null,
  },
}

export default function PolicyVenn() {
  const [hovered, setHovered] = useState(null)
  const [discovered, setDiscovered] = useState({ left: false, right: false })

  const gapRevealed = discovered.left && discovered.right

  const enter = useCallback(
    (id) => () => {
      setHovered(id)
      if (id === 'left' || id === 'right') {
        setDiscovered((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
      }
    },
    [],
  )

  const handleFigureMouseLeave = useCallback(() => setHovered(null), [])
  const handleFigureBlur = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setHovered(null)
  }, [])

  const detail = hovered ? DETAILS[hovered] : null

  return (
    <figure
      className={`policy-venn${hovered ? ' policy-venn--has-selection' : ''}${gapRevealed ? ' policy-venn--gap-revealed' : ''}`}
      role="figure"
      aria-labelledby="policy-venn-caption"
      onMouseLeave={handleFigureMouseLeave}
      onBlur={handleFigureBlur}
    >
      <svg
        viewBox="0 0 800 540"
        className="policy-venn-svg"
        role="group"
        aria-label="Two-circle Venn diagram of Massachusetts housing laws. Hover each law to reveal the gap between them."
      >
        {/* Left circle: MBTA Communities Act (zoning) */}
        <circle
          cx="280"
          cy="270"
          r="240"
          fill="rgba(0, 61, 165, 0.16)"
          stroke="rgba(0, 61, 165, 0.6)"
          strokeWidth="2"
          className={`policy-venn-region policy-venn-region--left${hovered === 'left' ? ' is-active' : ''}${hovered && hovered !== 'left' ? ' is-dimmed' : ''}`}
          tabIndex={0}
          aria-label="MBTA Communities Act, 2021. Hover for details."
          onMouseEnter={enter('left')}
          onFocus={enter('left')}
        />

        {/* Right circle: Affordable Homes Act (funding) */}
        <circle
          cx="520"
          cy="270"
          r="240"
          fill="rgba(0, 132, 61, 0.16)"
          stroke="rgba(0, 132, 61, 0.6)"
          strokeWidth="2"
          className={`policy-venn-region policy-venn-region--right${hovered === 'right' ? ' is-active' : ''}${hovered && hovered !== 'right' ? ' is-dimmed' : ''}`}
          tabIndex={0}
          aria-label="Affordable Homes Act, 2024. Hover for details."
          onMouseEnter={enter('right')}
          onFocus={enter('right')}
        />

        {/* Lens (overlap). Drawn after the circles so its paper fill
            sits on top, creating the visual "hole" that marks the gap.
            Only rendered after both laws have been hovered. Until then
            the central area is just the natural blend of the two
            transparent circles, giving nothing away. */}
        {gapRevealed && (
          <path
            d="M 400 62.15 A 240 240 0 0 1 400 477.85 A 240 240 0 0 1 400 62.15 Z"
            fill="#f5f0e0"
            stroke="#DA291C"
            strokeWidth="2.5"
            strokeDasharray="6 5"
            className={`policy-venn-region policy-venn-region--mid${hovered === 'mid' ? ' is-active' : ''}${hovered && hovered !== 'mid' ? ' is-dimmed' : ''}`}
            tabIndex={0}
            aria-label="The Gap: affordable housing near transit. Hover for details."
            onMouseEnter={enter('mid')}
            onFocus={enter('mid')}
          />
        )}

        {/* Side-lobe labels: year, law name (broken onto 3 lines so
            each word stands on its own and the title sets large), and
            a single-word keyword implying what the law does. */}
        <g className="policy-venn-labels">
          {/* Left lobe */}
          <text x="160" y="180" className="policy-venn-eyebrow" textAnchor="middle">
            2021
          </text>
          <text x="160" y="218" className="policy-venn-title" textAnchor="middle">
            <tspan x="160" dy="0">MBTA</tspan>
            <tspan x="160" dy="30">Communities</tspan>
            <tspan x="160" dy="30">Act</tspan>
          </text>
          <text x="160" y="350" className="policy-venn-tag" textAnchor="middle">
            ZONING
          </text>

          {/* Right lobe */}
          <text x="640" y="180" className="policy-venn-eyebrow" textAnchor="middle">
            2024
          </text>
          <text x="640" y="218" className="policy-venn-title" textAnchor="middle">
            <tspan x="640" dy="0">Affordable</tspan>
            <tspan x="640" dy="30">Homes</tspan>
            <tspan x="640" dy="30">Act</tspan>
          </text>
          <text x="640" y="350" className="policy-venn-tag" textAnchor="middle">
            FUNDING
          </text>

          {/* Lens: the gap (only after both laws discovered) */}
          {gapRevealed && (
            <g className="policy-venn-gap-text">
              <text x="400" y="235" className="policy-venn-missing-eyebrow" textAnchor="middle">
                THE GAP
              </text>
              <text x="400" y="278" className="policy-venn-missing-text" textAnchor="middle">
                Affordable
              </text>
              <text x="400" y="308" className="policy-venn-missing-text" textAnchor="middle">
                housing zones
              </text>
              <text x="400" y="338" className="policy-venn-missing-text" textAnchor="middle">
                near transit
              </text>
            </g>
          )}
        </g>
      </svg>

      {detail ? (
        <div
          className={`policy-venn-detail policy-venn-detail--${hovered}`}
          role="region"
          aria-live="polite"
        >
          <div
            className="policy-venn-detail-eyebrow"
            style={{ color: detail.color }}
          >
            {detail.eyebrow}
          </div>
          <div className="policy-venn-detail-title">{detail.title}</div>
          <p className="policy-venn-detail-body">{detail.body}</p>
          {detail.sourceHref ? (
            <p className="policy-venn-detail-source">
              Source:{' '}
              <a href={detail.sourceHref} target="_blank" rel="noreferrer">
                {detail.sourceLabel}
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <PolicyVennCaption discovered={discovered} />
      )}
    </figure>
  )
}

// Caption walks through three discovery states, guiding the reader
// to hover both laws before the gap is revealed.
function PolicyVennCaption({ discovered }) {
  const both = discovered.left && discovered.right
  const one = discovered.left !== discovered.right

  let body
  let hint
  if (both) {
    body =
      "Each law tackles one piece. Neither specifically requires the new transit-adjacent housing to be income-restricted, leaving the affordability-near-transit overlap unfilled."
    hint = 'Hover any region for more detail.'
  } else if (one) {
    body =
      "Two landmark laws, each tackling a different piece of the housing problem."
    hint = 'Hover the other law to reveal what they leave unfilled.'
  } else {
    body =
      'Massachusetts passed two landmark housing laws. Each tackles a different piece of the puzzle.'
    hint = 'Hover either law to learn more.'
  }

  return (
    <figcaption id="policy-venn-caption" className="policy-venn-caption">
      {body}{' '}
      <span className="policy-venn-caption-hint">{hint}</span>
    </figcaption>
  )
}
