import { describe, expect, it } from 'vitest';
import { addMonths, excelRound, firstOfMonth, workday } from './excel';

describe('excelRound', () => {
  it('rounds half away from zero', () => {
    expect(excelRound(2.5)).toBe(3);
    expect(excelRound(-2.5)).toBe(-3);
    expect(excelRound(0.5)).toBe(1);
  });
  it('rounds the displayed decimal, not the binary float', () => {
    expect(excelRound(2.675, 2)).toBe(2.68);
    expect(excelRound(1.005, 2)).toBe(1.01);
  });
  it('matches the workbook on values it rounds', () => {
    expect(excelRound(137 * 0.9)).toBe(123); // 123.3
    expect(excelRound(18.45 * 6)).toBe(111); // 110.7
  });
});

describe('dates', () => {
  it('WORKDAY backwards skips weekends (Assumptions I35)', () => {
    // 2027-03-01 minus (3+1+4)*5 + 3 = 43 working days
    expect(workday('2027-03-01', -43)).toBe('2026-12-30');
  });
  it('EDATE and first-of-month', () => {
    expect(addMonths('2027-03-01', 11)).toBe('2028-02-01');
    expect(firstOfMonth('2027-06-15')).toBe('2027-06-01');
  });
});
