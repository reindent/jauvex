// Stage two of the voice is a reflection and nothing else (T-201; the user, 2026-09-28: it "should not attempt to solve the user's problem or
// answer the question ... other than just reinforcing what the user said"). The lines below have the shapes the voice model really gave stage
// two (plans, promises, requests, questions, judgements, guesses, a guessed pronoun), with made-up subjects: the check before a line is spoken
// takes all of that out, keeps the reflection, and leaves a good reflection as it is. Greetings, small talk and thanks have nothing to
// reflect (the rule used when Jev is absent or unsure).
import { reflectionOnly, spokenReflection, smallTalk, weak } from '../shared/reflection.js';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };

const logged = [
  'Got it, I\'ll tell the design agent to add the export feature that was just built into the next release, version 2.4.1. That\'s a priority.',
  'Got it, I’ll keep the launch post as a draft, add the image when it arrives, and let you know when it’s ready.',
  'Got it, the staging server. I’ll use the access details you send to check whether the database is connected.',
  'Got it, you\'re on the office network now. I\'ll connect to the build server and install the test runner. You\'ll give me a link for the installation since it needs authentication. Starting now.',
  'Got it. You spoke with Dana for two hours about an ordering app, and you\'re planning to bring her on board as a customer. Tell me where the summary is and I\'ll review it.',
  'I\'ll render the video now and leave it ready for you to upload.',
  'I\'m doing well, thanks for asking. What can I help you with today?',
  'I\'m hearing you want to know whether agents can start other agents based on instructions from Claude, Codex, Grok, or other models. Let me look into what those agents can do.',
  'I’ll check the repository for the latest release details, then draft a post for your account.',
  'I’ll wait for the correct access details before checking the database connection.',
  'Let me check what access I have to the build server.',
  'The build server loses connection during long tasks and doesn\'t show when they finish; also the settings page differs from the desktop one; I\'ll fix the connection stability and unify the settings page now.',
  'Right, you want the importer to retry a failed row based on feedback, like rejecting and redoing a column. Checking what the importer supports now.',
  'That sounds simpler: I’ll leave the token setup aside, and the customer can sign in when they’re available.',
  'That\'s a fair point—if you genuinely need more than six retries, the retry limit would stop you. Let me see what the options are for getting around that.',
  'That\'s strange—the installer should have printed a link when it finished. Let me check what happened there.',
  'The thumbnail still hasn’t been picked up, so I’ll check the design agent’s status and what’s blocking it.',
  'You run the backups every night; good. Now you\'re asking if the old snapshots count against the storage quota. I\'ll check how that quota works and what the provider counts.',
  'You need a chat under each report like the dashboard has—a dedicated agent that reads your feedback and updates the report directly. I\'ll look at how to add that.',
  'You need the screenshots the design agent took comparing three competitors so you can see how their onboarding works. Pulling those up now.',
  'You want a sample board for a fictional project to show how boards work for the launch, but first let me check whether the release has the board chat we designed.',
  'You want me to push the 2.4.1 release and notify the design agent, and he needs to screenshot the sample board with the fake company agents that we set up. Sending that now.',
  'You want me to repeat what I just said about the retry limit. Let me go back over that explanation.',
  'You want to record the narration yourself with a proper accent and then use it to replace the voice in the video; I\'ll show you the best way to do both.',
  'You\'re saying retries need to be configurable at two levels—a global default in the settings, plus per-job overrides so each one can have its own rules. I\'ll look at how to design that.',
  'You\'re moving customer payments to the new account but unsure if the old billing carries over or if invoice numbering should restart. I\'ll sort out how the accounting ties together.',
  'Stage two should only echo back what you said, nothing more; no answers, no guesses, just reinforce. I\'ll lock down those constraints so it stays purely reflective.',
];
const PLANNED = /\b(i'll|i will|let me|i'm going to)\b|\b(starting|sending that|pulling those up) now\b|^checking\b|tell me\b|\?|fair point|that's strange|that sounds|thanks for asking|\bgood\.$/i;
const out = logged.map((l) => spokenReflection(l));
check('no plan, promise, request, question or judgement of the lines is said', out.every((o) => !PLANNED.test(o)), out.filter((o) => PLANNED.test(o)).join(' | '));
check('...and what is said is a checked line: checked again, it comes back as it is', logged.every((l) => { const once = reflectionOnly(l).line; return reflectionOnly(once).line === once && reflectionOnly(once).dropped.length === 0; }));
const at = (start: string) => spokenReflection(logged.find((l) => l.startsWith(start))!);
check('the reflection of a line is kept, its plan taken out ("I\'ll fix ... now")', at('The build server loses') === 'The build server loses connection during long tasks and doesn\'t show when they finish; also the settings page differs from the desktop one.', at('The build server loses'));
check('an answer to small talk and a question back are nothing: stage two is skipped', at('I\'m doing well') === '', at('I\'m doing well'));
check('a plan with no "I" goes ("Checking what ... now", "Pulling those up now")', at('Right, you want') === 'Right, you want the importer to retry a failed row based on feedback, like rejecting and redoing a column.' && !/Pulling/.test(at('You need the screenshots')), at('Right, you want'));
check('a plan joined by a comma goes, curly apostrophes and all (", so I’ll check ...")', at('The thumbnail') === 'The thumbnail still hasn\'t been picked up.', at('The thumbnail'));
check('...and one after ", but first"', at('You want a sample board') === 'You want a sample board for a fictional project to show how boards work for the launch.', at('You want a sample board'));
check('a request with no "?" goes ("Tell me where the summary is"), and a lone "Got it."', spokenReflection(logged[4]!, 'I spoke with Dana for two hours and I want to bring her on board') === 'You spoke with Dana for two hours about an ordering app, and you\'re planning to bring her on board as a customer.', spokenReflection(logged[4]!, 'I spoke with Dana and I want to bring her on board'));
check('a whole line of plans is nothing: stage two is skipped', ['I\'ll render', 'Let me check what access', 'I’ll wait', 'That sounds simpler'].every((s) => at(s) === ''));
const judged = reflectionOnly(logged.find((l) => l.startsWith('That\'s a fair point'))!);
check('a judgement and a plan go; an answer worded in the third person stays (the prompt\'s to stop, and the model-run check\'s)', judged.dropped.length === 2 && judged.line.startsWith('If you genuinely need'), JSON.stringify(judged));
// a pronoun is the user's to give: "he" said by the voice when the user never said it is a guess
const pushed = logged.find((l) => l.startsWith('You want me to push'))!;
check('a pronoun the user never said is a guess: that clause goes', !/\bhe\b/.test(spokenReflection(pushed, 'Push the 2.4.1 release and tell the design agent to screenshot the sample board.')), spokenReflection(pushed, 'Push the 2.4.1 release and tell the design agent to screenshot the sample board.'));
check('...one the user said stays', /\bhe needs\b/.test(spokenReflection(pushed, 'Push the 2.4.1 release, and tell the design agent he needs to screenshot the sample board.')));
// good reflections are left as they are
const good = ['You\'re asking whether I\'ll restart it after the build.', 'I\'m hearing you want to know whether agents can start other agents.', 'Better logs for the voice, so you can see what it heard.',
  'I can see you want the footer label renamed to Muster.', 'Hmm, so the orb is gone again after the reload.', 'You want to know what I\'m going to do with the tokens.', 'You want the footer label renamed.'];
check('good reflections are said as they are, "whether I\'ll", "I can see you want" and six words included', good.every((g) => spokenReflection(g) === g), good.filter((g) => spokenReflection(g) !== g).map((g) => `${g} -> ${spokenReflection(g)}`).join(' | '));
check('a rising "?" after a reflection is only a rising voice: said as a statement', spokenReflection('So you\'re asking whether an import can go back a step?') === 'So you\'re asking whether an import can go back a step.');
check('a cheer is taken out of what is said; "great question" is a judgement', spokenReflection('Great, so you want the footer label renamed to Muster.') === 'So you want the footer label renamed to Muster.' && spokenReflection('Great question, I\'ll answer that too.') === '');
// a BUSY line said on HEARD (the model mixing its jobs up: the app takes its word off and checks the rest) says nothing of BUSY's
check('what a BUSY line says is taken out, the reflection after it kept', ['Okay, switching to that right away.', 'Got it, I\'ll keep that for right after this.', 'Okay, I\'ll queue that up.', 'Got it, on it.', 'Okay, stopping now.'].every((l) => spokenReflection(l) === '') && spokenReflection('Got it, so you\'re asking whether the retry limit would block you if you needed seven retries.') === 'Got it, so you\'re asking whether the retry limit would block you if you needed seven retries.');
check('any verb in -ing that never turns to the user is the work ("moving ... and deploying"); "Nothing", "Something" still open reflections', spokenReflection('Got it, moving the export button next to save and deploying to staging.') === '' && spokenReflection('Nothing loads after the update since this morning.') === 'Nothing loads after the update since this morning.' && spokenReflection('Something is off with the orb after the reload.') === 'Something is off with the orb after the reload.' && spokenReflection('Going back to the retry question, you want seven retries.') === 'Going back to the retry question, you want seven retries.', spokenReflection('Got it, moving the export button next to save and deploying to staging.'));
check('one floor: a quick line or under six words is too little', weak('Sure, one moment.') && weak('Got it, the staging server.') && weak('The orb is gone.') && !weak('The orb is gone again today.'));
// greetings, small talk and thanks: nothing to reflect
check('a greeting, small talk or thanks is only that', ['Hello, how are you doing today?', 'Hey Claude, good morning, how is it going?', 'Thanks, that worked.', 'Okay, great, perfect, thank you so much.'].every(smallTalk));
check('...but not when it asks, reports or asks for something too', !['Thanks, now fix the footer too.', 'Hey, can you fix the footer?', 'Good morning! Ready to work on the voice?', 'Nice work on the board chat, it looks really good.'].some(smallTalk));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
