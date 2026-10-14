import { DB_VERSION, type Database, type Product, type ReceiveStockTx, type Salesman, type UserRecord } from './schema';

// Deterministic development data: the same database every time it is created or reset.

const SEED_AT = '2026-01-01T09:00:00.000Z';
const SEED_DATE = '2026-01-01';

export const SEED_USERS: UserRecord[] = [
  { id: 'owner', name: 'Owner', role: 'owner', username: 'owner', password: 'owner123' },
  { id: 'employee1', name: 'Employee 1', role: 'employee', username: 'employee1', password: 'employee123' },
  { id: 'employee2', name: 'Employee 2', role: 'employee', username: 'employee2', password: 'employee123' },
  { id: 'u-raj', name: 'Raj', role: 'salesman', username: 'raj', password: 'raj123', phone: '98250 11223', salesmanId: 'raj' },
  { id: 'u-amit', name: 'Amit', role: 'salesman', username: 'amit', password: 'amit123', phone: '98981 44556', salesmanId: 'amit' },
  { id: 'u-suresh', name: 'Suresh', role: 'salesman', username: 'suresh', password: 'suresh123', phone: '99099 77881', salesmanId: 'suresh' },
  { id: 'u-meena', name: 'Meena', role: 'salesman', username: 'meena', password: 'meena123', phone: '97270 33210', salesmanId: 'meena' },
];

export const SEED_SALESMEN: Salesman[] = [
  { id: 'raj', name: 'Raj', phone: '98250 11223', active: true },
  { id: 'amit', name: 'Amit', phone: '98981 44556', active: true },
  { id: 'suresh', name: 'Suresh', phone: '99099 77881', active: true },
  { id: 'meena', name: 'Meena', phone: '97270 33210', active: true },
];

// The product list from the customer's paper bills. Every salesman starts with no stock.
const NAMES = [
  'NYLE & CONDINER', 'BANSI TEL R', 'NIHAR COCONUT', 'MALABAR BOTTEL', 'MALABAR DABBA', 'BANSI COMBO',
  'BATH SOAP 30 SELL', 'BATH SOAP 120 SELL', 'GLEMER 100 SELL', 'SANTOOR', 'VIVEL', 'LUX', 'LIRIL',
  'MARGO & SOFTNES', 'ANCHOR', 'CLOSUP & PATNJALI', 'DABAR RED', 'CAVIGO', 'AGARBATTI', 'MOP', 'TOOTHBRUSH',
  'DRAIN CLEANER', 'DRUM CLEANER', 'SMELL DROP', 'AIR FRESHENER', 'FINAL GOLI', 'PITAMBRI POUCH',
  'SINGAL HOCKEY BRUSH', 'DOUBAL HOCKEY BRUSH', 'PREMIUM HOCKEY BRUSH', 'STEEL & NYLON JALI', 'ROOMAL JALI',
  'COLOR SCRUBER', 'BLACK SCRUBER', 'KAPDA BRUSH', 'WIPER', 'CHINA DORI', 'PAPER SOAP', 'FRIDGE MATT', 'LIGHTER',
  'PANI GARNI', 'STEEL JARI', 'WASHING MACHINE STAND', 'MAXO REFIEL', 'NAVA JALI LUFA', 'MATKA STAND',
  'LAXMAN REKHA', 'JELL & FACWASS', 'TANISH', 'PANDA', 'NANO', 'CLENIG POWDER', 'SHINE PLUS',
  'KAPDA BRUSH PLASTIC', 'KAPDA BRUSH WOODEN', 'TOOTHBRUSH SOFT', 'TOOTHBRUSH MEDIUM', 'TOOTHBRUSH KIDS',
  'BATH SOAP 60 SELL', 'BATH SOAP 100 SELL', 'DETOL SOAP', 'LIFEBUOY', 'HAMAM', 'CINTHOL', 'DOVE SOAP',
  'PARACHUTE COCONUT 100ML', 'PARACHUTE COCONUT 200ML', 'NIHAR COCONUT BOTTEL', 'BANSI TEL S', 'DABAR AMLA',
  'DABAR GULABARI', 'SUNSILK SACHET', 'CLINIC PLUS SACHET', 'HEAD & SHOULDERS SACHET', 'ROOMAL JALI SMALL',
  'NAVA JALI LUFA BIG', 'STEEL SCRUBER', 'DISH WASH BAR', 'VIM LIQUID', 'SURF EXCEL', 'WHEEL POWDER',
  'GHADI POWDER', 'TOILET CLEANER', 'PHENYL BOTTEL', 'DETOL LIQUID', 'AGARBATTI MOGRA', 'AGARBATTI CHANDAN',
  'DHOOP STICK', 'CAMPHOR TIKKI', 'MATCH BOX', 'MOSQUITO COIL', 'CANDLE PACKET', 'BROOM SOFT', 'PLASTIC DUSTPAN',
  'HAIR CLIP CARD', 'HAIR BAND', 'COMB LADIES', 'COMB GENTS', 'SHAVING CREAM', 'RAZOR BLADE',
];

const PRICES = [30, 40, 60, 80, 100, 120, 150, 180, 200, 250, 300, 350, 450, 600];

// Fixed values for the two products used in the walkthroughs.
const FIXED: Record<string, { amount: number; commission: number; stock: number }> = {
  'BANSI TEL R': { amount: 500, commission: 20, stock: 100 },
  'NIHAR COCONUT': { amount: 300, commission: 15, stock: 50 },
};

function buildProducts(): { products: Product[]; opening: ReceiveStockTx[] } {
  const products: Product[] = [];
  const opening: ReceiveStockTx[] = [];
  NAMES.forEach((name, i) => {
    const id = `p${String(i + 1).padStart(3, '0')}`;
    const fixed = FIXED[name];
    const amount = fixed?.amount ?? PRICES[(i * 7 + 3) % PRICES.length];
    const commission = fixed?.commission ?? Math.max(2, Math.round(amount * 0.06));
    const stock = fixed?.stock ?? (i % 17 === 0 ? 0 : ((i * 137) % 1850) + 12);
    products.push({ id, name, amount, commission, active: true });
    if (stock > 0) {
      opening.push({ id: `seed-${id}`, type: 'RECEIVE_STOCK', at: SEED_AT, date: SEED_DATE, productId: id, qty: stock, userId: 'owner', note: 'Opening stock' });
    }
  });
  return { products, opening };
}

export function createSeedDatabase(): Database {
  const { products, opening } = buildProducts();
  return {
    version: DB_VERSION,
    users: SEED_USERS.map((u) => ({ ...u })),
    products,
    salesmen: SEED_SALESMEN.map((s) => ({ ...s })),
    transactions: opening,
    returns: [],
  };
}
