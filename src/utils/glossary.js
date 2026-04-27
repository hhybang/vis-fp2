// Shared housing-policy glossary.
// Used by PolicyGapPanels (inline jargon tooltips + key-terms strip) and by
// KeyTermsButton (the persistent floating reference panel).

export const GLOSSARY = {
  'inclusionary zoning': {
    short: 'Inclusionary zoning',
    def: 'A rule that requires a share of units in new residential developments to be rented or sold below market rate to lower-income households.',
  },
  'inclusionary floor': {
    short: 'Inclusionary floor',
    def: 'The minimum share of units in new development that must be affordable. A "floor" is a requirement; a "cap" is a ceiling. Massachusetts has a cap, not a floor.',
  },
  'affordability floor': {
    short: 'Affordability floor',
    def: 'Same idea as an inclusionary floor: a statutory minimum share of affordable units in new housing, set at the state or local level.',
  },
  'deed-restricted': {
    short: 'Deed-restricted',
    def: 'Units with a legal covenant on the property that caps rent or sale price to stay affordable for a set period (typically 30+ years).',
  },
  'AMI': {
    short: 'AMI',
    def: 'Area Median Income. The middle household income for a metro area. In Greater Boston, 80% AMI is roughly $102k for a 2-person household; 50% AMI is roughly $64k.',
  },
  'area median income': {
    short: 'Area Median Income (AMI)',
    def: 'The middle household income for a metro area. Used to define who counts as "low-income" for affordable-housing rules.',
  },
  'deep affordability': {
    short: 'Deep affordability',
    def: 'Housing targeted at households earning less than 50% of Area Median Income: the renters most reliant on transit and least able to afford a car.',
  },
  'safe-harbor cap': {
    short: 'Safe-harbor cap',
    def: 'Under MBTA Communities rules, a municipality\'s inclusionary policy can\'t exceed 10% affordable at 80% AMI without an economic feasibility study, effectively capping ambition at that level.',
  },
  'as-of-right': {
    short: 'As-of-right zoning',
    def: 'Zoning that approves development automatically if it meets the rules, without requiring a discretionary vote or special permit.',
  },
  'by-right': {
    short: 'By-right zoning',
    def: 'Same as as-of-right: development is permitted automatically when it complies with objective zoning standards.',
  },
  'anti-displacement': {
    short: 'Anti-displacement protections',
    def: 'Rules like rent stabilization, just-cause eviction, and tenant right-of-first-refusal that help existing renters stay in place when their neighborhood upzones.',
  },
  'TOD': {
    short: 'Transit-oriented development (TOD)',
    def: 'Dense, walkable, mixed-use development intentionally located near transit stations to reduce car dependence and expand access to jobs and services.',
  },
  'upzone': {
    short: 'Upzone',
    def: 'To change a neighborhood\'s zoning to allow more or denser housing than previously permitted.',
  },
  'Section 3A': {
    short: 'Section 3A',
    def: 'The statute (MGL c. 40A §3A) behind the MBTA Communities Act, which sets the zoning-capacity rules for 177 transit-served municipalities.',
  },
}

// Curated subset shown in the in-line "Key terms" strip and the floating
// reference panel. Order is the reading order we want.
export const KEY_GLOSSARY_TERMS = [
  'inclusionary floor',
  'deed-restricted',
  'AMI',
  'deep affordability',
  'safe-harbor cap',
  'anti-displacement',
]
