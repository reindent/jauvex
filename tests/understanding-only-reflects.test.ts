// llm
import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// Stage two is a reflection and nothing else (T-201; the user, 2026-09-28: it "should not attempt to solve the user's problem or answer the
// question"), from the prompt alone: the voice model's own line, before the check that runs on it, has nothing that check would take out
// (no plan, promise, request, question or judgement), answers nothing (a question it could answer, a "what happens if"), guesses no pronoun,
// and names what was said; a greeting gets no stage two at all. On both small voice models, Claude's and Codex's: Codex's wrote most of the
// plans in the log. CVC_VOICE_PROVIDERS=claude (or codex) runs one.
const voice = await import('../electron/voice.ts'); const { reflectionOnly, weak } = await import('../shared/reflection.ts');
const providers = (process.env.CVC_VOICE_PROVIDERS ?? 'claude,codex').split(',').map((x) => x.trim()) as ('claude' | 'codex')[];
let failed = 0; const check = (name: string, ok: boolean, line: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: "${line}"`); if (!ok) failed++; };
const cases: { name: string; said: string; names: RegExp; never?: RegExp; recent?: string }[] = [
  { name: 'a question it could answer is said back, not answered', said: 'Can a git branch name have a slash in it, or will the push fail?', names: /branch|slash|push|git/i, never: /^\W*(yes|no)\b|(?<!\b(whether|if)\b[^.;]*)\b((is|are) (allowed|fine|supported|valid)|works fine|(won't|will not|doesn't|does not) (fail|break)|git (allows|supports|accepts)|can (contain|have|include))\b/i },
  // RECENT says the limit is six: the model may use it to say back what "the retry limit" is, never to work out that it would stop them
  { name: 'a "what happens if" is said back, not worked out', said: 'What happens if a row needs seven retries in the importer, does the retry limit stop it?', names: /retr|limit|import|row/i, never: /(?<!\b(whether|if)\b[^.;]*)\b(would|will) (stop|block|end|halt|cut)\b|(?<!\b(whether|if|when)\b[^.;]*)\b(stops|stopped|won't|will not|can't|cannot)\b|^\W*(yes|no)\b/i,
    recent: 'User: can the importer retry a failed row?\nAssistant: Yes: a failed row is tried again, and it stops after six retries.' },
  { name: 'a request is said back as what they want, with no plan', said: 'Please move the export button next to the save button and ship it to staging.', names: /export|button|staging/i },
  { name: 'a problem is said back with concern, no cheer, no cause', said: 'The orb is gone from the left pane again after the reload, it was there a minute ago.', names: /orb/i, never: /^\W*(great|sure|okay|ok|perfect)\b|because|probably|must be/i },
  { name: 'no pronoun guessed for someone the user named', said: 'Ask the design agent to screenshot the sample board with the fake company agents for the launch.', names: /screenshot|sample board|design agent/i, never: /\b(he|him|his|she|her|hers)\b/i },
];
const main = (p: string) => (p === 'codex' ? 'Codex, model gpt-5.5' : 'Claude, model claude-opus-5');
for (const p of providers) {
  voice.warmAck(p, ''); await new Promise((r) => setTimeout(r, 2500));
  for (const c of cases) {
    // a reply in the COMMAND job's shape ("NONE", seen from Haiku) is dropped by the app, which asks again: so does this (one in the BUSY shape,
    // "STEER: Got it, so you're asking ...", comes back with its word taken off, and is checked below like any other)
    // and a line the check leaves nothing of (a BUSY line: "Got it, moving the export button ... and deploying") is asked again, as the app does
    let raw = await voice.heardLine(c.said, p, '', main(p), c.recent ?? '');
    if (!raw || weak(reflectionOnly(raw, c.said).line)) { console.log(`  [${p}] asked again, as the app does, after: "${raw}"`); raw = await voice.heardLine(c.said, p, '', main(p), c.recent ?? ''); }
    const r = reflectionOnly(raw, c.said);
    check(`[${p}] ${c.name}`, !!raw && r.dropped.length === 0 && c.names.test(raw) && !(c.never?.test(raw)), `${raw}${r.dropped.length ? `  (the check would take out: ${r.dropped.join(' | ')})` : ''}`);
  }
  const hello = await voice.understand('Hello there, how are you doing today? Hope you had a good weekend.', p, '', main(p));
  check(`[${p}] a greeting gets no stage two`, hello === '', hello);
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); voice.shutdown(); process.exit(failed ? 1 : 0);
