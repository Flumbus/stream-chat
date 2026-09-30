export const defaultFont = 'Segoe UI';
export const fallbackFonts = [defaultFont, 'Arial', 'Consolas'];
export function isFontFamily(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= 120 &&
    !/[\p{Cc};{}<>]/u.test(value)
  );
}
export function fontStack(family: string) {
  return `${JSON.stringify(isFontFamily(family) ? family.trim() : defaultFont)}, "Segoe UI", Arial, sans-serif`;
}
export function normalizeFonts(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const names = new Map<string, string>();
  for (const item of input.slice(0, 10000)) {
    if (isFontFamily(item) && !item.trim().startsWith('@'))
      names.set(item.trim().toLowerCase(), item.trim());
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
