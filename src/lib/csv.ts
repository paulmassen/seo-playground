const FORMULA_PREFIX = /^[\s\uFEFF]*[=+\-@]/;

/** Prevent spreadsheet formula execution while preserving the visible text. */
export function neutralizeSpreadsheetFormula(value: unknown): string {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

export function csvCell(value: unknown): string {
  const text = neutralizeSpreadsheetFormula(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRows(rows: unknown[][], lineBreak = '\n'): string {
  return rows.map((row) => row.map(csvCell).join(',')).join(lineBreak);
}
