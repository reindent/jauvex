// A message's quote (shared/quote.ts): its "> " lines told from its own words, never inside code, and what a click on it looks for. Pure, quick.
import { quoteKey, quoteParts } from '../shared/quote.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const parts = quoteParts('> Like this, this is a quote\n> And this is a multi line one\n\nYes, go ahead.');
check("a message's quote and its own words, in order", JSON.stringify(parts) === JSON.stringify([{ quote: true, text: 'Like this, this is a quote\nAnd this is a multi line one' }, { quote: false, text: 'Yes, go ahead.' }]), JSON.stringify(parts));
check('a ">" inside a code fence is code, not a quote', quoteParts('```sh\n> npm i\n```').every((p) => !p.quote));
check('a message with no quote is its words, whole', JSON.stringify(quoteParts('Hello\n\nthere')) === JSON.stringify([{ quote: false, text: 'Hello\n\nthere' }]));
check('a quote is looked for by its first words, flat (no marks, one space, lower case), a line or more until there are enough', quoteKey('Should I create the **dashboard**?\nSay "write the dashboard"') === 'should i create the dashboard?' && quoteKey('Ship it?\nThe build   is *ready*') === 'ship it? the build is ready', quoteKey('Should I create the **dashboard**?\nSay "write the dashboard"'));
check('...too few words to find: nothing', quoteKey('Ok') === '');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
