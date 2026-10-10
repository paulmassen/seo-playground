import { describe, expect, it } from 'vitest';
import { csvCell, csvRows, neutralizeSpreadsheetFormula } from './csv';

describe('CSV spreadsheet safety', () => {
  it.each(['=1+1', '+cmd', '-10+20', '@HYPERLINK("http://x")', ' \t=SUM(A1:A2)'])('neutralizes formula-like value %s', (value) => {
    expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`);
  });

  it('does not alter normal values', () => {
    expect(neutralizeSpreadsheetFormula('normal text')).toBe('normal text');
    expect(neutralizeSpreadsheetFormula('email@example.com')).toBe('email@example.com');
  });

  it('quotes CSV syntax after neutralizing formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('hello, world')).toBe('"hello, world"');
  });

  it('serializes rows safely', () => {
    expect(csvRows([['Name', 'Value'], ['Attacker', '=1+1']])).toBe('Name,Value\nAttacker,\'=1+1');
  });
});
