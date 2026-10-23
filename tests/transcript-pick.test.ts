// A stretch of speech keeps its fullest text (shared/transcript.ts): a pass that heard "I" for two sentences, and the cases around it.
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const { pickTranscript, suspicious, wakeMatch } = await import('../shared/transcript.ts');
const best = "We can wait. And if we open a second shop that is maybe in the north, then we'll keep the same prices for now.";
check('the pass that heard "I" where an earlier one heard two sentences is suspicious', suspicious('I', best));
check('a retry that hears it all wins', pickTranscript('I', best, `${best} Right now the hardest part is the delivery.`).by === 'retry');
check('a retry that fails too leaves the earlier pass', pickTranscript('I', best, 'I').text === best);
check('a phantom dropped to nothing is caught the same way', pickTranscript('', best, null).by === 'earlier pass');
check('a final pass that heard as much or more is kept as it is', pickTranscript(`${best} And more.`, best, null).by === 'final pass' && pickTranscript('Short one.', 'Hi there', null).by === 'final pass');
const yes = ['Hey Jauvex.', 'Hey, Jev, X.', 'hey javex', 'Hey Jovex!', 'Hey, Jauvex', 'Hey Jauvex, are you there?'];
const no = ['Hey, how are you?', 'Hey there.', 'Okay.', 'Jauvex is great, now please fix the failing build in the homepage', 'Hey Jeff.', ''];
check('the wake phrase is heard by sound, the way the small model spells it', yes.every((h) => wakeMatch(h, 'Hey Jauvex')), JSON.stringify(yes.filter((h) => !wakeMatch(h, 'Hey Jauvex'))));
check('and other words are not', no.every((h) => !wakeMatch(h, 'Hey Jauvex')), JSON.stringify(no.filter((h) => wakeMatch(h, 'Hey Jauvex'))));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
