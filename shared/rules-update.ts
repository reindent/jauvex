// New rules for a conversation that already exists (1.8.0). A provider keeps the briefing a conversation started with: Claude Code records it and sends that record on every resume (the app turns
// that off, electron/chat.ts), Codex keeps a thread's first instructions whatever a resume passes, and Grok takes its rules only when a session is
// made. So an agent made before an update never learned what the update taught. For Codex and Grok the app sends what is new in the briefing once,
// after the person's words of the next turn, in a tag the chat never shows (CONTEXT_TAG in web/src/App.tsx). Pure: tests/rules-update.test.ts.
export const RULES_TAG = 'app-rules-update';
/** Words from a person or another agent with the tag taken out, so that only the app adds it: typed in, it would hide words from the chat and
 *  pass them off as the app's rules. */
export const withoutRulesTag = (text: string): string => text.replace(/<\s*\/?\s*app-rules-update\s*>/gi, '');

/** The briefing's paragraphs: split at blank lines, a fenced block kept whole with the paragraph it sits in. */
export function rulesParts(text: string): string[] {
  const out: string[] = []; let cur: string[] = []; let fence = false;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (!fence && !line.trim()) { if (cur.length) out.push(cur.join('\n')); cur = []; continue; }
    cur.push(line);
  }
  if (cur.length) out.push(cur.join('\n'));
  return out.map((p) => p.trim()).filter(Boolean);
}

/** A short fingerprint of a paragraph (53 bits, base 36): what the app keeps of the rules a conversation was given. */
export function partKey(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** What a conversation is told when the briefing changed since it was given one: the paragraphs it never had (all of them when the app does not
 *  know what it had), in the tag, and the keys to keep for it from now on. An empty note when nothing is new. */
export function rulesNote(now: string, had: readonly string[] | null): { note: string; keys: string[] } {
  const parts = rulesParts(now); const keys = parts.map(partKey); const old = new Set(had ?? []);
  const fresh = had ? parts.filter((_, i) => !old.has(keys[i]!)) : parts;
  if (!fresh.length) return { note: '', keys };
  const head = had
    ? 'The app that runs you has updated its rules since this conversation began. These rules are new or changed; they replace any earlier wording of the same rule:'
    : 'The app that runs you has updated its rules since this conversation began. These are its rules now, in full; they replace the ones you were given at the start:';
  return { note: `\n\n<${RULES_TAG}>\n${head}\n\n${fresh.join('\n\n')}\n</${RULES_TAG}>`, keys };
}
