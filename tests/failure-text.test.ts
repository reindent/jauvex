// An agent's answer is never taken for the provider's own failure because of what it talks about (T-270, from the other edition's fix: an
// agent's stand-up summary there showed as "The provider could not answer", for mentioning a rate limit). The rule took
// any answer under 700 characters with a number from 500 to 599 in it ("4,500 characters", "4,532,147 bytes"), or a word such as "rate
// limit", "authentication", "403", for a failure: a red card, and no spoken summary. Eleven answers in one day there. A failure is the
// provider's own text, and it starts the answer; Claude's are marked by its SDK besides (chat.ts).
const { failureText } = await import('../shared/failure.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const answers = [ // answers of the kinds taken for failures that day, in words of this check's own
  '1) Working on: the bakery\'s order form. Next is the menu photos.\n2) Done: the shop\'s authentication flow passes review.\n3) Blocked: nothing.',
  'The newsletter is 640 words, about four minutes to read. Next I\'m writing the recipe card, about 4,500 characters.',
  'The backup is ready.\n- **Archive:** last night\'s, 4,532,147 bytes, checksum 5e0f12aa.',
  'The change has taken effect: **the shop address now reaches the new host** (before, it said "not authorized").',
  'All three image sizes work, and each resized the test photo in under 500 ms.',
  'The upload stopped at the host\'s rate limit, so I spaced the requests out; all 40 files are up now.',
];
const failures = [ // the providers' own texts (the first as Claude Code's binary has it)
  'API Error: 401 Invalid API key · Please run /login',
  'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
  'API Error: Request timed out.',
  'Credit balance is too low',
  'Claude AI usage limit reached|1759622400',
  'Your organization has disabled Claude subscription access.',
];
const wrong = answers.filter((a) => failureText(a));
check('an agent\'s answer that talks about rate limits, authentication, or numbers from 500 to 599 is an answer, not a failure', wrong.length === 0, wrong.map((a) => a.slice(0, 50)).join(' | '));
const missed = failures.filter((f) => !failureText(f));
check("the provider's own failure texts are still failures", missed.length === 0, missed.join(' | '));
check('...but not when an answer quotes one further down', !failureText('The deploy is done. Earlier it said:\nAPI Error: 401 Invalid API key · Please run /login\nI signed in again and it went through.'));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
