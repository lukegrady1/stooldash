/**
 * Text hygiene shared by the engine (pure) and the API layer.
 * Nothing in here touches I/O, time or randomness.
 */

// C0/C1 controls (minus tab/newline, which collapseWhitespace handles), soft hyphen,
// zero-width and bidi-control characters, line/paragraph separators, BOM and
// interlinear annotation marks. Built from code points so the source stays ASCII.
const CONTROL_RANGES: Array<[number, number]> = [
  [0x0000, 0x0008],
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfeff, 0xfeff],
  [0xfff9, 0xfffb],
];

const hex = (n: number) => '\\u' + n.toString(16).padStart(4, '0');
const CONTROL_RE = new RegExp(
  '[' + CONTROL_RANGES.map(([a, b]) => (a === b ? hex(a) : hex(a) + '-' + hex(b))).join('') + ']',
  'gu',
);

/** Remove control, zero-width and bidi-override characters. Keeps emoji. */
export function stripControl(s: string): string {
  return s.replace(CONTROL_RE, '');
}

/** Collapse any run of whitespace (including newlines) into a single space and trim. */
export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Full clean for user-provided single-line text. */
export function cleanText(s: string): string {
  return collapseWhitespace(stripControl(s));
}

/** Length in Unicode code points (so an emoji counts as 1, not 2). */
export function charLength(s: string): number {
  return Array.from(s).length;
}
