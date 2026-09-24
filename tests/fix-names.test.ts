import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// However speech-to-text spells the app's name, the transcript says Jauvex.
const { fixNames } = await import('../electron/voice.ts');
const cases: [string, string][] = [['I said J-E-V', 'I said Jev'], ['a new jev agent', 'a new Jev agent'], ['make a Jav agent', 'make a Jev agent'], ['a Jeff classifier', 'a Jev classifier'], ['I met Jeff yesterday', 'I met Jeff yesterday'], ['JaV is fast', 'JaV is fast'], ['Open Jovex please', 'Open Jauvex please'], ['I said Javex.', 'I said Jauvex.'], ['Claudex is great', 'Jauvex is great'], ['the jauvix agent', 'the Jauvex agent'], ['jobex settings', 'Jauvex settings'], ['job ex agent', 'Jauvex agent'], ['Jauvex stays', 'Jauvex stays'], ['java and javascript stay', 'java and javascript stay'], ['the vexing jokes', 'the vexing jokes']];
let bad = 0; for (const [i, want] of cases) { const got = fixNames(i); const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${JSON.stringify(i)} -> ${JSON.stringify(got)}`); }
console.log(bad ? `${bad} FAILED` : 'ALL PASS'); process.exit(bad ? 1 : 0);
