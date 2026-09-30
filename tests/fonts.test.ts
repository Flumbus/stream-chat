import { expect, it } from 'vitest';
import { fontStack, normalizeFonts } from '../src/shared/fonts';
import { themeSchema } from '../src/shared/validation';
import { themes } from '../src/shared/themes';
it('accepts installed family names and retains an unavailable saved family', () => {
  expect(themeSchema.parse({ ...themes[0], fontFamily: 'Aptos Display' }).fontFamily).toBe(
    'Aptos Display',
  );
  expect(
    themeSchema.parse({ ...themes[0], fontFamily: 'Uninstalled custom font' }).fontFamily,
  ).toBe('Uninstalled custom font');
  expect(fontStack('Uninstalled custom font')).toContain('"Segoe UI", Arial, sans-serif');
});
it('normalizes duplicates and rejects unsafe font data', () => {
  expect(
    new Set(normalizeFonts(['Arial', 'arial', '@Vertical', null, 'A; color:red', ' Шрифт '])),
  ).toEqual(new Set(['arial', 'Шрифт']));
  expect(themeSchema.safeParse({ ...themes[0], fontFamily: 'font; color:red' }).success).toBe(
    false,
  );
  expect(fontStack('Font "name"')).toContain('"Font \\"name\\""');
});
