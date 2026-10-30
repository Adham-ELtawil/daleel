// Repair public prose only; keep identifiers, values and internal reasoning intact.
export function fixArabicPublicText(text: string): string {
  return text.replace(/^([\t ]*)(?=[A-Za-z`])/gm, "$1الـ ");
}
