import { describe, it, expect } from 'vitest';
import { fitWindow } from '../src/shared/desktop';
describe('window placement in device-independent pixels', () => {
  const main = { x: 0, y: 0, width: 1920, height: 1040 };
  it('keeps valid geometry on a monitor with negative coordinates', () => {
    const left = { x: -1600, y: 0, width: 1600, height: 900 };
    const saved = { x: -1550, y: 80, width: 1000, height: 700 };
    expect(fitWindow(saved, [main, left])).toEqual(saved);
  });
  it('recovers after monitor removal and fits a small work area', () => {
    const small = { x: 0, y: 0, width: 800, height: 600 };
    expect(fitWindow({ x: 5000, y: 4000, width: 3000, height: 2000 }, [small])).toEqual(small);
    expect(fitWindow(undefined, [main]).width).toBe(1440);
  });
});
