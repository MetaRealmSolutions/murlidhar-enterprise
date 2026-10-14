// Formatting helpers and static business details. Everything that changes lives in src/data.

/** 1250 -> "1,250", 125000 -> "1,25,000" */
export function num(n: number) {
  const s = String(Math.abs(n));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return n < 0 ? `-${grouped}` : grouped;
}

export const rupees = (n: number) => `₹${num(n)}`;

export const BUSINESS_NAME = 'Murlidhar Enterprise';

/** The client's business details, as printed on the bill. One place, so Settings and the Private Bill print can never disagree. */
export const BUSINESS_GSTIN = '24AXSPA2573M1Z5';
export const BUSINESS_PHONES = ['9909071340', '9909771340', '9909271340'];
export const BUSINESS_ADDRESS = 'Mandvi - Bhuj Highway Road, Mandvi-Kutch, Gujarat - 370465';

// Visual switch only: the data shown elsewhere does not change per business.
export const businesses = [
  { id: 'b1', name: 'Murlidhar Enterprise', place: 'Mandvi' },
  { id: 'b2', name: 'Bhuj Trading', place: 'Bhuj' },
];
