// Per-unit values of a bill line that is being CORRECTED. A finalized bill keeps the amount and commission it was billed at, so a
// correction changes quantities only and never reprices the line from the current Item Master.
//
// Fallback (documented): a legacy line that has no usable saved value (missing or not a finite number >= 0) takes the current Item
// Master value for that field only. A saved 0 is a real value and is kept. A product newly added to the bill during the correction
// has no saved line, so it takes the current Item Master values (it is billed now).
type Saved = { unitAmount?: number; unitCommission?: number };
type Master = { amount?: number; commission?: number } | undefined;

const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function correctionUnitValues(saved: Saved, master: Master): { unitAmount: number; unitCommission: number } {
  return {
    unitAmount: usable(saved.unitAmount) ? saved.unitAmount : (master?.amount ?? 0),
    unitCommission: usable(saved.unitCommission) ? saved.unitCommission : (master?.commission ?? 0),
  };
}
