// The app's own colours, made with the Jauvex agent (T-278; the user, 2026-10-01: "We have right now Auto, Dark, Light, and then one more
// that says Custom. And when you do custom ... You're going to talk with the Jauvex agent, and the Jauvex agent is going to tell you, OK, what
// would you feel like? And it will give you three ideas ... of colors. And then once you select one, You will be able to ... modify ... to the
// colors that you want. Let's start first with colors"). A palette is a base (the light or the dark theme, whose other colours it keeps) and
// the colours it changes; the agent puts it on with the `theme` command, and the app refuses one whose text would be hard to read. Pure:
// tests/palette.test.ts.

/** The colours a palette can set, each a token of the stylesheet (var(--bg) ...), and what it paints. */
export const PALETTE_KEYS = {
  bg: 'the chat, behind the conversation', side: 'the left pane', line: 'borders and dividers', row: 'a selected row in the left pane',
  'row-hover': 'a row under the pointer', bubble: 'your own messages', fg: 'text', 'fg-2': 'secondary text', muted: 'quiet text (times, hints)',
  faint: 'the faintest text and placeholders', accent: 'links, lit buttons, badges: the one colour that stands out', 'code-bg': 'code blocks',
  'code-fg': 'code text', err: 'errors', ok: 'success', warn: 'warnings',
} as const;
export type PaletteKey = keyof typeof PALETTE_KEYS;
export type Palette = { name?: string; base: 'light' | 'dark'; colors: Partial<Record<PaletteKey, string>> };

/** The base themes' own colours that readability is judged against when a palette leaves them as they are (web/src/styles.css). */
const BASE: Record<Palette['base'], Record<'bg' | 'side' | 'fg' | 'muted' | 'accent', string>> = {
  dark: { bg: '#141413', side: '#0f0f0e', fg: '#eceae3', muted: '#8a8882', accent: '#979dff' },
  light: { bg: '#ffffff', side: '#fafafa', fg: '#171717', muted: '#737373', accent: '#4f46e5' },
};

const hex = (v: unknown): string | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v ?? '').trim()); if (!m) return null;
  const h = m[1]!.toLowerCase(); return `#${h.length === 3 ? h.split('').map((c) => c + c).join('') : h}`;
};
/** WCAG relative luminance and contrast ratio (1 to 21). */
const lum = (h: string): number => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
export const contrast = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

/** A palette as the agent gives it (JSON text or an object), checked: the base, known keys only, colours as #rrggbb, and text that can be
 *  read (body text and the left pane's at least 4.5:1 on their backgrounds, quiet text and the accent at least 3:1). With no base, the
 *  background's lightness picks it. */
export function readPalette(raw: unknown): { ok: true; palette: Palette } | { ok: false; error: string } {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return { ok: false, error: 'not JSON: give {"name": "...", "base": "light" or "dark", "colors": {"bg": "#rrggbb", ...}}' }; } }
  if (!v || typeof v !== 'object') return { ok: false, error: 'a palette is an object: {"name", "base", "colors"}' };
  const o = v as { name?: unknown; base?: unknown; colors?: unknown };
  if (!o.colors || typeof o.colors !== 'object') return { ok: false, error: '"colors" is missing: {"bg": "#rrggbb", "fg": "#rrggbb", "accent": "#rrggbb", ...}' };
  const colors: Palette['colors'] = {};
  for (const [k, c] of Object.entries(o.colors as Record<string, unknown>)) {
    if (!(k in PALETTE_KEYS)) return { ok: false, error: `"${k}" is not a colour of the app: ${Object.keys(PALETTE_KEYS).join(', ')}` };
    const h = hex(c); if (!h) return { ok: false, error: `${k}: "${String(c)}" is not a colour (#rrggbb)` };
    colors[k as PaletteKey] = h;
  }
  if (!Object.keys(colors).length) return { ok: false, error: 'no colours given' };
  const base: Palette['base'] = o.base === 'light' || o.base === 'dark' ? o.base : colors.bg ? (lum(colors.bg) > 0.4 ? 'light' : 'dark') : 'dark';
  if (o.base !== undefined && o.base !== 'light' && o.base !== 'dark') return { ok: false, error: '"base" is "light" or "dark": the theme whose other colours it keeps' };
  const eff = { ...BASE[base], ...colors } as Record<string, string>;
  const need: [string, string, number, string][] = [['fg', 'bg', 4.5, 'text on the chat'], ['fg', 'side', 4.5, 'text on the left pane'], ['muted', 'bg', 3, 'quiet text on the chat'], ['accent', 'bg', 3, 'the accent on the chat']];
  for (const [a, b, min, what] of need) { const r = contrast(eff[a]!, eff[b]!); if (r < min) return { ok: false, error: `${what} would be hard to read: ${a} ${eff[a]} on ${b} ${eff[b]} is ${r.toFixed(1)}:1, it needs ${min}:1` }; }
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : undefined;
  return { ok: true, palette: { ...(name ? { name } : {}), base, colors } };
}

/** The stylesheet's variables a palette sets on the page's root. */
export const cssVars = (p: Palette): Record<string, string> => Object.fromEntries(Object.entries(p.colors).map(([k, c]) => [`--${k}`, c]));

/** What the app tells the Jauvex agent when the user picks Custom. */
export const customThemeNote = (current: Palette | null): string =>
  '(from the app) The user picked Custom in Settings, Appearance: they want the app in colours of their own. Ask them in one short line what ' +
  'they feel like (a mood, a place, colours they love), then offer three palette ideas, each with a name, a few words and its main colours, ' +
  'and put on the one they pick with the theme command; then change it as they say. ' +
  (current ? `The palette on now: ${JSON.stringify(current)}.` : 'No palette of their own yet.');
