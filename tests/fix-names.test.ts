import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// However speech-to-text spells the app's name, the transcript says Jauvex.
const { fixNames } = await import('../electron/voice.ts');
const cases: [string, string][] = [['I said J-E-V', 'I said Jev'], ['a new jev agent', 'a new Jev agent'], ['make a Jav agent', 'make a Jev agent'], ['a Jeff classifier', 'a Jev classifier'], ['I met Jeff yesterday', 'I met Jeff yesterday'], ['JaV is fast', 'JaV is fast'], ['Open Jovex please', 'Open Jauvex please'], ['I said Javex.', 'I said Jauvex.'], ['Claudex is great', 'Jauvex is great'], ['the jauvix agent', 'the Jauvex agent'], ['jobex settings', 'Jauvex settings'], ['job ex agent', 'Jauvex agent'], ['Jauvex stays', 'Jauvex stays'], ['java and javascript stay', 'java and javascript stay'], ['the vexing jokes', 'the vexing jokes']];
// T-75 (2026-09-24, dictated): "the coding agent that uses Claud", "the Reindent agent that uses Cloud": Claude, where the words say so;
// the cloud of computing stays.
cases.push(['brief the coding agent that uses Claud.', 'brief the coding agent that uses Claude.'], ['the Reindent agent that uses Cloud.', 'the Reindent agent that uses Claude.'],
  ['start a cloud agent', 'start a Claude agent'], ['open cloud code in that folder', 'open Claude Code in that folder'], ['a cloud and a Codex agent', 'a Claude and a Codex agent'],
  ['Codex or cloud, you pick', 'Codex or Claude, you pick'], ['use cloud Opus for it', 'use Claude Opus for it'], ['it is using cloud for the voice', 'it is using Claude for the voice'],
  ['it runs in the cloud', 'it runs in the cloud'], ['a cloud server on Hetzner', 'a cloud server on Hetzner'], ['cloud computing is big', 'cloud computing is big'],
  ['the app uses cloud storage', 'the app uses cloud storage'], ['a cloud of smoke', 'a cloud of smoke']);
// T-126 (2026-09-24, dictated to the Creative Agent): "the Reindent coding agent that runs on Claude" came out as "the Reindent code
// engine that runs on Cloud", and the task went to the Codex "Coding Agent". Runs on, the agent on, the one on: Claude.
cases.push(['The code, the Reindent code engine that runs on Cloud.', 'The code, the Reindent code engine that runs on Claude.'],
  ['send it to the coding agent on cloud, please', 'send it to the coding agent on Claude, please'], ['the one on cloud, not the Codex one', 'the one on Claude, not the Codex one'],
  ['the agents running on cloud and the ones on Codex', 'the agents running on Claude and the ones on Codex'],
  ['it runs on cloud servers', 'it runs on cloud servers'], ['our backups run in the cloud.', 'our backups run in the cloud.'], ['it is on cloud now', 'it is on cloud now']);
// Grok (xAI's coding agent, 2026-09-24): "add grog support", "the Grog CLI" as dictated; Groq, another company, stays.
cases.push(['add grog support, please', 'add Grok support, please'], ['the Grog CLI', 'the Grok CLI'], ['a grock agent', 'a Grok agent'], ['a Groq endpoint', 'a Groq endpoint'], ['a glass of grog', 'a glass of Grok']);
// "Hey Jauvex" heard as "Javek" (the launch spot's transcript, 2026-10-04; as Jauvex Pro): its near misses, and the real words that stay.
cases.push(['Hey Javek, open the dashboard', 'Hey Jauvex, open the dashboard'], ['hey javec', 'hey Jauvex'], ['Jawek, I have an idea', 'Jauvex, I have an idea'], ['Yavex, stop', 'Jauvex, stop'], ['a Java class', 'a Java class'], ['the javelin', 'the javelin'], ['my jacket', 'my jacket']);
// "Hola, Jauvex" heard as "Alla Jauvex," (2026-10-05, as Jauvex Pro): a greeting before the name only; "allá" elsewhere stays
cases.push(['Alla Jauvex, abre el panel', 'Hola Jauvex, abre el panel'], ['Ola, Jauvex', 'Hola, Jauvex'], ['Allá Javek, ¿qué tal?', 'Hola Jauvex, ¿qué tal?'], ['olla jauvex', 'Hola Jauvex'], ['Gracias. Alla Jauvex', 'Gracias. Hola Jauvex'], ['ve allá mañana', 've allá mañana'], ['la olla está caliente', 'la olla está caliente'], ['Hola Jauvex', 'Hola Jauvex']);
// "Jarvex" and "Jorvex" (as Jauvex Pro)
cases.push(['Jarvex, open the dashboard', 'Jauvex, open the dashboard'], ['hey jorvex', 'hey Jauvex']);
let bad = 0; for (const [i, want] of cases) { const got = fixNames(i); const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${JSON.stringify(i)} -> ${JSON.stringify(got)}`); }
console.log(bad ? `${bad} FAILED` : 'ALL PASS'); process.exit(bad ? 1 : 0);
