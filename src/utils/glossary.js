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
    def: 'The minimum share of units in new development that must be affordable. A "floor" is a requirement.',
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
    short: 'Area Median Income (AMI)',
    def: 'HUD-published benchmark used to set income eligibility for affordable housing. 100% AMI for a 2-person Boston household = $127,200 in 2024.',
  },
  'area median income': {
    short: 'Area Median Income (AMI)',
    def: 'HUD-published benchmark used to set income eligibility for affordable housing. 100% AMI for a 2-person Boston household = $127,200 in 2024.',
  },
  'deep affordability': {
    short: 'Deep affordability',
    def: 'Housing targeted at households earning less than 50% of Area Median Income: the renters most reliant on transit and least able to afford a car.',
  },
  'as-of-right': {
    short: 'As-of-right zoning',
    def: 'Zoning that approves development automatically if it meets the rules, without requiring a discretionary vote or special permit.',
  },
  'by-right': {
    short: 'By-right zoning',
    def: 'Same as as-of-right: development is permitted automatically when it complies with objective zoning standards.',
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
]
