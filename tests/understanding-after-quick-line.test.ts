// llm
import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// Stage two is told what stage one said: it never repeats the quick line and complements it with the ask and the context.
const voice = await import('../electron/voice.ts'); voice.warmAck('claude', ''); await new Promise((r) => setTimeout(r, 2500));
const main = 'Claude, model claude-opus-5'; let failed = 0;
const check = (name: string, ok: boolean, line: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: "${line}"`); if (!ok) failed++; };
const opens = (line: string, words: RegExp) => words.test(line.trim().split(/\s+/).slice(0, 2).join(' '));

// A request, after "Sure, one moment.": no "one moment" again, no opening with sure/okay, and it names the ask.
const a = await voice.understand('Okay, please list the files in this folder and tell me which one is the biggest.', 'claude', '', main, '', 'Sure, one moment.');
check('a request continues from the quick line', a.split(/\s+/).length >= 7 && !/one (moment|second)/i.test(a) && !opens(a, /^(sure|okay|ok|got it)\b/i) && /file|folder|biggest|largest|list/i.test(a), a);

// A problem, after "Hmm, that's strange.", with the recent context: no "strange" again, no cheer, and it names the orb.
const recent = 'User: move the orb to the bottom of the left pane.\nAssistant: Done, the orb now sits at the bottom of the left pane and the voice settings open from it.';
const b = await voice.understand('The orb is gone from the left pane again after the restart, it was there a minute ago.', 'claude', '', main, recent, "Hmm, that's strange.");
check('a problem continues from the quick line with the context', b.split(/\s+/).length >= 7 && !/strange/i.test(b) && !opens(b, /^(hmm|sure|great|okay|ok)\b/i) && /orb|pane|restart|hides|hidden|missing|gone/i.test(b), b);

console.log(failed ? `${failed} FAILED` : 'ALL PASS'); voice.shutdown(); process.exit(failed ? 1 : 0);
