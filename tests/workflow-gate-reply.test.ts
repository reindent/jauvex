// What a step's agent found, for the person at the gate after it (shared/gate-reply.ts, the same in Jauvex Personal and Jauvex Pro). The case
// that asked for it, 2026-10-03: a research step narrated first ("I'll check @ReindentAI, read For You…"), saved six candidates in
// runs/004/candidates.md and asked the user to pick; the record kept the narration and the gate showed only the question.
const { stepFile, stepReplyText, saidOf, questionOf, choicesOf, linkedFiles } = await import('../shared/gate-reply.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const RUN = '/home/d/Reindent/Marketing/workflows/news-video/runs/004';
const reply = `I'll check @ReindentAI, read For You and the last two days of the AI news, then pick candidates for a short video.

\`\`\`
search: "claude code" since:2026-10-01
\`\`\`

## Candidates

I saved six candidates in [candidates.md](runs/004/candidates.md), with sources in ${RUN}/sources.md. The strongest two are the agent
benchmark story and the voice-coding demo; both have footage we can use.

**CHOICE:** Agent benchmark — the new leaderboard, with our own run as the hook
- CHOICE: Voice coding – a live demo of talking to three agents at once
CHOICE: Pricing change: what the new plans mean for a solo developer
CHOICE: agent benchmark — said twice, kept once
FOR YOU: Pick a topic and angle for the video.
OUTCOME: continue`;

check('a step\'s reply is kept as step-N.md in its run folder', stepFile(1) === 'step-1.md' && stepFile(12) === 'step-12.md');
const file = stepReplyText(reply);
check('the kept reply has no OUTCOME and no FOR YOU line, and keeps its CHOICE lines and the rest', !/OUTCOME|FOR YOU/.test(file) && (file.match(/CHOICE/g) ?? []).length === 4 && file.includes('## Candidates') && file.includes('search: "claude code"'));
const big = `${'word '.repeat(60_000)}\n`.repeat(2) + 'OUTCOME: continue';
const bigKept = stepReplyText(big);
check('a reply over 200 KB is kept up to 200 KB, cut at a line, and says so', new TextEncoder().encode(bigKept).length <= 200 * 1024 + 80 && bigKept.length > 150 * 1024 && /word\n\n\[… cut here/.test(bigKept) && bigKept.endsWith('longer than 200 KB]'), `${bigKept.length} chars`);
check('a short reply is kept as it is, trimmed', stepReplyText('  Done: three files.\nOUTCOME: continue\n') === 'Done: three files.');

const s = saidOf(reply);
check('the record\'s said: is the reply\'s result (its last paragraph), not its opening narration', s.startsWith('I saved six candidates') && !s.includes("I'll check"), s);
check('...within 240 characters, cut on a word', s.length <= 240 && (s.endsWith('…') ? !/\s…$/.test(s) : true), `${s.length}: ${s.slice(-30)}`);
check('...never a code block, a heading or the app\'s own lines', saidOf('Done.\n\n```\nls\n```\n\n## Next\nOUTCOME: continue') === 'Done.' && saidOf('') === '' && saidOf('OUTCOME: continue') === '');
check('...a short reply as it is, on one line', saidOf('All tests pass.\nThree files changed.\nOUTCOME: continue') === 'All tests pass. Three files changed.');

check('the question is the FOR YOU line', questionOf(reply) === 'Pick a topic and angle for the video.');
check('...the last one when there are several, bold or not', questionOf('FOR YOU: first\n**FOR YOU:** second one\nOUTCOME: continue') === 'second one');
check('...else the reply\'s last paragraph', questionOf('I drafted the post.\n\nShould it go out today or Monday?\nOUTCOME: continue') === 'Should it go out today or Monday?');

const ch = choicesOf(reply);
check('the choices: label and line, in order, any dash or a colon, bold and list marks allowed, no repeats', JSON.stringify(ch) === JSON.stringify([
  { label: 'Agent benchmark', detail: 'the new leaderboard, with our own run as the hook' },
  { label: 'Voice coding', detail: 'a live demo of talking to three agents at once' },
  { label: 'Pricing change', detail: 'what the new plans mean for a solo developer' }]), JSON.stringify(ch));
check('...a label alone is a choice too', JSON.stringify(choicesOf('CHOICE: Ship it')) === JSON.stringify([{ label: 'Ship it', detail: '' }]));
check('...at most six', choicesOf(Array.from({ length: 9 }, (_, i) => `CHOICE: Option ${i + 1} — line`).join('\n')).length === 6);
check('...none when the agent offered none', choicesOf('FOR YOU: Approve?\nOUTCOME: continue').length === 0);
check('...a word "choice" in a sentence is not one', choicesOf('My choice: the second one, because it is shorter.').length === 0 && choicesOf('The CHOICE is yours.').length === 0);

const files = linkedFiles(reply, RUN);
check('the run\'s files the reply names: from a markdown link (path from the workflow folder) and an absolute path', JSON.stringify(files) === JSON.stringify(['candidates.md', 'sources.md']), JSON.stringify(files));
check('...from the project, from the run folder itself, nested, without repeats, in order', JSON.stringify(linkedFiles('See workflows/news-video/runs/004/notes/a.md, then candidates.md and ./candidates.md again.', RUN)) === JSON.stringify(['notes/a.md', 'candidates.md']));
check('...never a web link, another run\'s file, a file elsewhere, or "e.g." and "1.5"', linkedFiles('[site](https://x.com/a.html) runs/003/candidates.md /etc/hosts.conf src/app.ts e.g. version 1.5 and ../secrets.env', RUN).length === 0, JSON.stringify(linkedFiles('[site](https://x.com/a.html) runs/003/candidates.md /etc/hosts.conf src/app.ts e.g. version 1.5 and ../secrets.env', RUN)));
check('...a link with spaces in angle brackets or percent-encoded', JSON.stringify(linkedFiles(`[a](<${RUN}/my notes.md>) [b](runs/004/final%20cut.txt)`, RUN)) === JSON.stringify(['my notes.md', 'final cut.txt']));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
