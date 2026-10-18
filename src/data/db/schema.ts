// The shape of the application data, as held in memory from the Firestore collections
// (users, products, salesmen, transactions, settlements, directBills).
//
// There is ONE warehouse stock: products/{id}.stock.
//   - Stock received from a party raises it (a RECEIVE_STOCK entry carrying the party name and number).
//   - A direct (private) bill lowers it, in the same atomic write as the bill.
//   - Salesman bills never move it: their Add More and Return are figures on the bill only.
//
// Sources of truth:
//   transactions  date-wise: transactions/{yyyy-mm-dd}/entries/{id}, RECEIVE_STOCK entries (the Stock Receive statement, grouped by party).
//   dailyBills    salesmen/{id}/dailyBills/{date}: salesman daily bills, one document per salesman and date. Open (finalized: false) it holds
//                 the Add More figures; finalized it holds the whole bill. Per product:
//                     Fillup   = the previous bill's Return (carried forward, never stored on an open bill)
//                     Add More = quantity added today
//                     Total    = Fillup + Add More
//                     Sold     = Total - Return   (only worked out once the owner enters the Return)
//   directBills   goods sold straight from the godown to a customer, at rates typed by the owner.

export type Role = 'owner' | 'salesman' | 'employee';

/** What an Employee may use. Each switch is independent; the owner has everything. (Frontend checks only: see src/auth/access.ts.) */
export type Permissions = { stockAccess: boolean; privateBillsAccess: boolean; salesmenAccess: boolean };

/** users/{firebaseAuthUid}: the application profile. The role comes from here, never from the client. */
export type UserProfile = {
  /** The Firebase Auth uid (also the document id). */
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  phone?: string;
  /** Only for role "salesman": the salesmen/{id} whose stock, sales and statement belong to this account. */
  salesmanId?: string;
  /** Only for role "employee". */
  permissions?: Permissions;
};

export type Product = {
  id: string;
  name: string;
  /** Selling amount per unit (Product Master). */
  amount: number;
  /** Salesman commission per unit (Product Master). */
  commission: number;
  /** Stock at or below this (and above 0) is Low Stock. Products saved before it existed have none: read it as 0. */
  minimumStock?: number;
  /** Opening warehouse stock (products/{id}.stock). Later Receive Stock entries are added on top. */
  stock: number;
  /** The opening count the owner last saved (already the product's `stock`, which stays the only balance). Absent = not entered yet; 0 = an intentional zero. Set when a product is added with a quantity, or by Item Master → Opening Stock. */
  openingStock?: number;
  /** ISO time and user id of the last save. */
  openingStockAt?: string;
  openingStockBy?: string;
  /** Display order in the Item Master (an order number, not the identity). Older items have none until the list is first reordered. */
  serial: number;
  active: boolean;
};

export type Salesman = {
  id: string;
  name: string;
  phone: string;
  details?: string;
  active: boolean;
};

type TxBase = {
  id: string;
  /** ISO date-time the event was recorded. */
  at: string;
  /** Local calendar day of `at` (yyyy-mm-dd). */
  date: string;
  /** The business date (yyyy-mm-dd, Asia/Kolkata) the entry is filed under: transactions/{businessDate}/entries/{id}. */
  businessDate?: string;
  productId: string;
  qty: number;
  /** Who recorded it. */
  userId: string;
};

/** External party → warehouse. One document per product; the lines of one receipt share `receiptId`. */
export type ReceiveStockTx = TxBase & {
  type: 'RECEIVE_STOCK';
  note?: string;
  /** products.stock was raised by this entry. */
  stockApplied?: boolean;
  /** Purchase price per unit of this product on this receipt (entered by hand; never the Item Master selling price). Absent on older receipts. */
  purchasePrice?: number;
  receiptId?: string;
  /** parties/{partyId} (the party's 10-digit mobile number). Older receipts have none until backfilled. */
  partyId?: string;
  partyName?: string;
  partyPhone?: string;
};

/** parties/{partyId}: who stock is received from. The id IS the normalized 10-digit mobile number, so a number can only ever have one party. The name is free text (may repeat or be misspelt). */
export type Party = { id: string; name: string; mobile: string };

/** receiptPayments/{receiptId}: whether one stock receipt (bill) has been paid. A receipt with no document is Unpaid. Kept apart from the append-only ledger, so changing it never touches stock or the receipt. */
/**
 * receiptPayments/{receiptId}: payment summary of one stock receipt. `paid` is the older Paid / Unpaid switch. Receipts made with a
 * purchase amount also carry totalAmount / paidAmount (the summary of their payment entries); older receipts have neither, so no
 * purchase price is ever invented for them.
 */
export type ReceiptPayment = { id: string; paid: boolean; totalAmount?: number; paidAmount?: number };

/** receiptPaymentEntries/{entryId}: one payment made to the supplier against ONE receipt. Permanent; the first one is `<receiptId>_p0`. */
export type ReceiptPaymentEntry = { id: string; receiptId: string; amount: number; at: string; createdAt?: string; userId: string };
export type Transaction = ReceiveStockTx;
export type TransactionType = Transaction['type'];

/** One product on a salesman's bill. Return is what the owner entered; the rest is a snapshot of the derivation. */
export type SettlementLine = {
  productId: string;
  /** Fillup: carried in from the previous bill's Return. */
  carriedOpeningQuantity: number;
  /** Add More: quantity added to the bill that day. */
  newFillupQuantity: number;
  /** Total = Fillup + Add More. */
  totalAvailableQuantity: number;
  /** Quantity the salesman returned / still holds (0 until the bill is finalized). */
  returnQuantity: number;
  /** On an open bill: the owner has typed this Return (a saved draft, so a reload keeps it). */
  returnEntered?: boolean;
  /** Total − Return (0 until the bill is finalized). */
  soldQuantity: number;
  /** Unit values copied from the Product Master when the line was first finalized. */
  unitAmount: number;
  unitCommission: number;
};

/** salesmen/{salesmanId}/dailyBills/{statementDay}: one salesman's bill for one business date (in the app its id is `${salesmanId}_${statementDay}`). Open (finalized: false) until the Return is entered. */
export type Settlement = {
  id: string;
  salesmanId: string;
  /** Business day (yyyy-mm-dd). */
  statementDay: string;
  finalized: boolean;
  finalizedAt: string;
  finalizedBy: string;
  createdAt: string;
  updatedAt: string;
  lines: SettlementLine[];
  /** salesmen/{salesmanId}/dailyBills/{businessDate}: the same date as statementDay, Asia/Kolkata. */
  businessDate?: string;
  /** 'open' = the working bill; 'finalized' = Return confirmed (what Statements read). Mirrors `finalized`. */
  status?: 'open' | 'finalized';
  /** Audit trail of the stock given today: one entry per Save Stock Given (its unique id, time and quantity per product). The lines' Add More is their sum, and an id is applied only once. */
  stockGiven?: { id: string; at: string; items: Record<string, number> }[];
  /** Corrections of a finalized bill: one entry per same-day correction that changed Sold (its id, time and the change in Sold per product, + more sold / - less). The auditable source of those stock changes. */
  corrections?: { id: string; at: string; items: Record<string, number> }[];
  /** Totals of a finalized bill: Fillup (Fillup + Add More), Return, Sold, Amount, Commission. */
  totals?: { fillup: number; returned: number; sold: number; amount: number; commission: number };
};

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export type DirectBillLine ={ productId: string; name: string; qty: number; rate: number; total: number };

/** directBills/{id}: goods sold straight from the godown. Rates are typed by the owner, never taken from the Item Master. */
export type DirectBill = {
  id: string;
  customerName: string;
  customerPhone: string;
  /** ISO date-time the bill was saved. */
  at: string;
  /** Local calendar day of `at`. */
  date: string;
  lines: DirectBillLine[];
  total: number;
  /** Payment taken when the bill was saved. Absent on older bills: read them with billPayment() (Unpaid, full amount remaining). */
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus?: PaymentStatus;
  userId: string;
  /** Set when the bill has been edited (customer, lines): when, by whom, and the id of the last edit submission (so a repeated Save changes nothing twice). */
  updatedAt?: string;
  updatedBy?: string;
  lastEditId?: string;
};

/**
 * directBillPayments/{paymentId}: one payment received against a private bill. Permanent: never edited or deleted.
 * The payment taken when the bill was made is the first record (id `<billId>_p0`). Bills saved before payment records existed have
 * only the bill's paidAmount: their opening payment is shown from that field (see paymentHistory), so nothing is duplicated.
 */
export type DirectBillPayment = {
  id: string;
  billId: string;
  amount: number;
  /** ISO date-time the money was received. */
  at: string;
  /** Server time the record was written (ISO), when known. */
  createdAt?: string;
  userId: string;
};

/**
 * expenses/{id}: one business expense (petrol, tea, salary, ...). Owner only. `date` is the business date (Asia/Kolkata, yyyy-mm-dd) the
 * expense belongs to and is what the Home totals and the filters use; `createdAt` is when it was recorded (ISO) and `userId` who recorded it.
 */
export type Expense = {
  id: string;
  title: string;
  amount: number;
  date: string;
  notes: string;
  createdAt: string;
  userId: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type Database = {
  users: UserProfile[];
  products: Product[];
  salesmen: Salesman[];
  transactions: Transaction[];
  settlements: Settlement[];
  directBills: DirectBill[];
  directBillPayments: DirectBillPayment[];
  parties: Party[];
  receiptPayments: ReceiptPayment[];
  receiptPaymentEntries: ReceiptPaymentEntry[];
  expenses: Expense[];
};
