import { describe, expect, it } from 'vitest';
import { exportFileName } from './download';

describe('exportFileName', () => {
  it('is illustration-<W>x<H>-<YYYY-MM-DD>.svg in local time', () => {
    expect(exportFileName({ width: 800, height: 1200 }, new Date(2026, 10, 3, 23, 59))).toBe(
      'illustration-800x1200-2026-11-03.svg',
    );
    expect(exportFileName({ width: 1000, height: 1000 }, new Date(2027, 0, 9))).toBe(
      'illustration-1000x1000-2027-01-09.svg',
    );
  });
});
