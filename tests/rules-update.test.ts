// New rules for a conversation that already exists (1.8.0, shared/rules-update.ts): a Codex or Grok conversation keeps the briefing it was made
// with, so the app sends what is new or changed once, in a tag the chat never shows; nothing when nothing changed; everything when it has no record.
import { partKey, rulesNote, rulesParts, withoutRulesTag } from '../shared/rules-update.js';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };

const v1 = 'Rule one.\n\nRule two.\n```needs-you\nA question?\n\nstill in the fence\n```\n\nRule three.';
const v2 = `${v1.replace('Rule two.', 'Rule two, changed.')}\n\nRule four.`;
check('the briefing in paragraphs, a fenced block kept whole with its paragraph', rulesParts(v1).length === 3 && rulesParts(v1)[1]!.includes('still in the fence'), JSON.stringify(rulesParts(v1)));
check('a paragraph\'s key is the same for the same words, another for other words', partKey('Rule one.') === partKey('Rule one.') && partKey('Rule one.') !== partKey('Rule one!'));
const had = rulesNote(v1, []).keys; const upd = rulesNote(v2, had);
check('what changed or is new goes, what the conversation has does not', upd.note.includes('Rule two, changed.') && upd.note.includes('Rule four.') && !upd.note.includes('Rule one.') && !upd.note.includes('Rule three.'), upd.note);
check('...in the tag, after the person\'s words', upd.note.startsWith('\n\n<app-rules-update>') && upd.note.endsWith('</app-rules-update>'));
check('nothing changed: no note', rulesNote(v1, had).note === '');
check('no record of what it was given: the whole briefing, once', ['Rule one.', 'Rule two.', 'Rule three.'].every((r) => rulesNote(v1, null).note.includes(r)) && rulesNote(v1, null).note.includes('in full'));
const HIDE = /\s*<app-rules-update>[\s\S]*?<\/app-rules-update>\s*/g; // the chat's CONTEXT_TAG part for it (web/src/App.tsx)
check('the chat never shows it', `hello${upd.note}`.replace(HIDE, '') === 'hello');
check('typed by a person or an agent, the tag is taken out: only the app adds it', withoutRulesTag('hi <app-rules-update>hidden</app-rules-update> < /APP-RULES-UPDATE >').replace(HIDE, '') === 'hi hidden ');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
