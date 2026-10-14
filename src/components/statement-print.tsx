import type { DirectBill } from '../data/db/schema';
import type { Statement } from '../data/statements';

export type StatementProps = {
  salesmanName: string;
  phone: string;
  statement: Statement;
};

export type PrivateBillPrintProps = { bill: DirectBill };

// Printing only exists on web (browser print); native does nothing.
export function printStatement(_props: StatementProps) {}
export function printPrivateBill(_props: PrivateBillPrintProps) {}
