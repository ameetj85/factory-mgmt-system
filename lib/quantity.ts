// Quantities are stored as integer thousandths ("milli") of the unit of measure, and money as
// integer cents, so arithmetic never drifts. These helpers convert to and from user input.

const QTY_PATTERN = /^\d+(\.\d{1,3})?$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Parses a non-negative decimal string with up to 3 decimals into thousandths. Returns null if invalid. */
export function parseQtyMilli(input: string): number | null {
  const value = input.trim().replace(/,/g, "");
  if (!QTY_PATTERN.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(milli) ? milli : null;
}

/** Parses a non-negative money string with up to 2 decimals into cents. Returns null if invalid. */
export function parseCents(input: string): number | null {
  const value = input.trim().replace(/[$,]/g, "");
  if (!MONEY_PATTERN.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

const qtyFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatQty(milli: number, uom?: string): string {
  const text = qtyFormat.format(milli / 1000);
  return uom ? `${text} ${uom}` : text;
}

/** Plain decimal string for pre-filling inputs (no grouping separators). */
export function qtyInputValue(milli: number): string {
  return String(milli / 1000);
}

export function formatCents(cents: number | null | undefined): string {
  return cents == null ? "—" : moneyFormat.format(cents / 100);
}
