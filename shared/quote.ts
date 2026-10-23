// A message's quote (as in the other edition, a quote that looks like one and can be clicked): what a message quotes, its "> " lines, shows as a quote above its own words, and a click on it goes to the
// message it quotes (web/src/quoteJump.ts). Pure: tests/quote.test.ts.
/** A message's text in quote and plain stretches, in order: a line that opens with ">" is quoted, except inside a code fence. */
export function quoteParts(text: string): { quote: boolean; text: string }[] {
  const out: { quote: boolean; text: string }[] = []; let fence = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = fence ? null : /^\s{0,3}>\s?(.*)$/.exec(line); const quote = !!m; const words = m ? m[1]! : line;
    const last = out.at(-1); if (last && last.quote === quote) last.text += `\n${words}`; else out.push({ quote, text: words });
  }
  return out.map((p) => ({ ...p, text: p.text.replace(/^\n+|\n+$/g, '') })).filter((p) => p.text.trim());
}
/** Words as the chat shows them, for finding a quote in it: no markdown marks or list numbers, one space between words, lower case. */
export const flatText = (text: string): string => text.toLowerCase().replace(/[*_`#]+/g, '').replace(/^\s*(?:[-•]|\d{1,2}[.)])\s+/gm, '').replace(/\s+/g, ' ').trim();
/** What a quote is looked for by in the chat (alpha-22: a click on a quote in a sent message takes you to the message it quotes): its first words,
 *  flat (`flatText`), up to 80 characters; '' when it has too few to find. */
export function quoteKey(quote: string): string {
  const lines = quote.replace(/\r/g, '').split('\n').map(flatText).filter(Boolean); let key = '';
  for (const l of lines) { key = key ? `${key} ${l}` : l; if (key.length >= 24) break; }
  return key.length >= 6 ? key.slice(0, 80).trim() : '';
}
