// Inventory definitions shared by server and client code.

export const ITEM_TYPES = ["raw", "wip", "finished"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  raw: "Raw material",
  wip: "Sub-assembly (WIP)",
  finished: "Finished good",
};

export const UNITS_OF_MEASURE = [
  { value: "ea", label: "Each (ea)" },
  { value: "pcs", label: "Pieces (pcs)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "g", label: "Grams (g)" },
  { value: "lb", label: "Pounds (lb)" },
  { value: "L", label: "Litres (L)" },
  { value: "mL", label: "Millilitres (mL)" },
  { value: "m", label: "Metres (m)" },
  { value: "cm", label: "Centimetres (cm)" },
  { value: "ft", label: "Feet (ft)" },
  { value: "box", label: "Boxes (box)" },
  { value: "roll", label: "Rolls (roll)" },
  { value: "sheet", label: "Sheets (sheet)" },
  { value: "set", label: "Sets (set)" },
] as const;

export const TXN_TYPES = [
  "RECEIPT",
  "ADJUSTMENT",
  "SCRAP",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "SHIPMENT",
  "MATERIAL_CONSUMPTION",
  "PRODUCTION_OUTPUT",
] as const;
export type TxnType = (typeof TXN_TYPES)[number];

export const TXN_TYPE_LABELS: Record<TxnType, string> = {
  RECEIPT: "Receipt",
  ADJUSTMENT: "Adjustment",
  SCRAP: "Scrap",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  SHIPMENT: "Shipment",
  MATERIAL_CONSUMPTION: "Consumption",
  PRODUCTION_OUTPUT: "Production output",
};

export const ADJUSTMENT_REASONS = [
  { value: "CYCLE_COUNT", label: "Cycle count correction" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "EXPIRED", label: "Expired" },
  { value: "SCRAP", label: "Scrapped" },
  { value: "FOUND", label: "Found stock" },
  { value: "LOST", label: "Lost / missing" },
  { value: "DATA_CORRECTION", label: "Data entry correction" },
  { value: "OTHER", label: "Other" },
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]["value"];

export function adjustmentReasonLabel(code: string): string {
  return ADJUSTMENT_REASONS.find((r) => r.value === code)?.label ?? code;
}

/** Reasons that remove material as waste are posted as SCRAP; everything else as ADJUSTMENT. */
export function txnTypeForReason(reason: string): TxnType {
  return reason === "SCRAP" || reason === "DAMAGED" || reason === "EXPIRED" ? "SCRAP" : "ADJUSTMENT";
}

export type StockStatus = "ok" | "low" | "out";

export function stockStatus(qtyMilli: number, reorderPointMilli: number): StockStatus {
  if (qtyMilli <= 0) return "out";
  if (qtyMilli < reorderPointMilli) return "low";
  return "ok";
}
