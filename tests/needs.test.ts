// What an agent asks you with its answers (shared/needs.ts, the other edition's rules): a question's options read, a pick sent back with the
// question quoted, which questions a reply answered, and which of your messages answer which box. Pure, quick.
import { answersIn, answerText, hasOptions, needsQuestions, optionOf, personReplies } from '../shared/needs.ts';
import type { ChatMessage } from '../shared/types.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };

// Answer buttons (T-404): a question's options under an `options:` line, read, named in plain words, sent back with the question quoted, and
// what a reply picked read back from it
const ask = 'Release this version now, later today, or next week?\noptions:\n- Now (recommended): publish it right away\n- Later today — after your evening test\n- Next week';
const qs = needsQuestions(ask);
check('a question with its options: labels, what each means, the recommended one', qs.length === 1 && qs[0]!.text === 'Release this version now, later today, or next week?' && qs[0]!.options.map((o) => o.label).join('|') === 'Now|Later today|Next week' && qs[0]!.options[0]!.recommended && qs[0]!.options[1]!.detail === 'after your evening test' && !qs[0]!.many, JSON.stringify(qs));
check('...a time in a label is kept whole, and "options, any:" lets several be picked', optionOf('At 10:00: the morning slot')?.label === 'At 10:00' && needsQuestions('Which?\noptions, any:\n- A\n- B')[0]!.many);
check('...a label keeps no hidden direction or zero-width marks, so it shows the words it sends', optionOf('\u202eYes, send\u202c: now')?.label === 'Yes, send' && optionOf('No\u200b')?.label === 'No');
check('...a block with no options line is one question, as before, its list left alone', needsQuestions('I need:\n- the key\n- the domain').length === 1 && needsQuestions('I need:\n- the key\n- the domain')[0]!.options.length === 0);
const two = needsQuestions('When?\noptions:\n- Now\n- Later\n\nWhich channel?\noptions:\n- Alpha\n- Beta');
check('...several questions in one block, each with its own options', two.length === 2 && two[1]!.text === 'Which channel?' && two[1]!.options.length === 2, JSON.stringify(two));
const sent = answerText([{ text: qs[0]!.text, picks: ['Later today'] }]);
check('a pick goes back as the reply, the question quoted over it', sent === '> Release this version now, later today, or next week?\n\nLater today', sent);
const picked = (reply: string, q: ReturnType<typeof needsQuestions>) => JSON.stringify(answersIn(reply, q).map((a) => (a.answered ? a.picks : null)));
check('...and is read back from it; so is the label typed or said alone, in any case; words that name none answer the box', picked(sent, qs) === '[["Later today"]]' && picked('now', qs) === '[["Now"]]' && picked('maybe tomorrow', qs) === '[[]]');
check('...two questions answered at once: each its own pick', picked(answerText([{ text: 'When?', picks: ['Later'] }, { text: 'Which channel?', picks: ['Beta'] }]), two) === '[["Later"],["Beta"]]');
// Each question answered on its own (alpha-22: a later answer disabled the buttons of an earlier question): a reply quoting one question answers that one alone; a quote of another box's question answers nothing here.
check('one question of two answered, the other stays open', picked(answerText([{ text: 'Which channel?', picks: ['Beta'] }]), two) === '[null,["Beta"]]', picked(answerText([{ text: 'Which channel?', picks: ['Beta'] }]), two));
check('...a quote of another box\'s question answers nothing here', picked('> Ship it as alpha-22 or as alpha-23?\n\nAs alpha-23', two) === '[null,null]');
const numbered = needsQuestions('1. The shop has sold gift cards since spring. Keep them, or take them out?\noptions:\n- Keep them (recommended): customers keep what they have\n- Take them out: the shop stops selling them\n2. Which items should the Writer Agent draft?\noptions:\n- 1 to 6 (recommended): the menu plus five\n- Only 1: the menu first\n- 1 to 7: also the recipes');
check('numbered questions, each with its options: two questions, never the second one as an option of the first', numbered.length === 2 && numbered[0]!.options.map((o) => o.label).join() === 'Keep them,Take them out' && /Which items/.test(numbered[1]!.text) && numbered[1]!.options.length === 3, JSON.stringify(numbered.map((q) => [q.text, q.options.map((o) => o.label)])));
const fenced = (body: string) => `Here.\n\n\`\`\`needs-you\n${body}\n\`\`\``;
const msg = (uuid: string, role: 'user' | 'assistant', text: string): ChatMessage => ({ uuid, role, blocks: [{ type: 'text', text }] } as ChatMessage);
const replies = personReplies([msg('a', 'assistant', fenced(ask)), msg('b', 'user', '(from agent "X") hi'), msg('c', 'user', 'Now'), msg('d', 'assistant', 'Done.')]);
check('the person\'s reply to a question is their next message, never an agent\'s; a message that asks nothing has none', replies.get('a') === 'Now' && !replies.has('d'), JSON.stringify([...replies]));
const SHIP = 'Ship it as alpha-22 or as alpha-23?\noptions:\n- As alpha-22: the number it has\n- As alpha-23: the next one'; // its own list (FB-112: the app makes none)
const later = personReplies([msg('a', 'assistant', fenced(ask)), msg('b', 'assistant', fenced(SHIP)), msg('c', 'user', '> Ship it as alpha-22 or as alpha-23?\n\nAs alpha-23'), msg('d', 'user', '> Release this version now, later today, or next week?\n\nNow')]);
check('...an older question is never answered by the reply to a newer one, and later by a reply that quotes it', picked(later.get('a') ?? '', qs) === '[["Now"]]' && !/alpha-23/.test(later.get('a') ?? '') && picked(later.get('b') ?? '', needsQuestions(SHIP)) === '[["As alpha-23"]]', JSON.stringify([...later]));
// A box asked again while still open shows once, at its newest place (a request showed twice)
// Buttons come only from the agent's own list (FB-112: the agent writes logical options, the app never infers them from an "or"):
// the app makes none of its own, whatever the question looks like; a question without a list is answered by typing.
const labels = (q: string) => needsQuestions(q).map((x) => x.options.map((o) => o.label).join('|')).join(' / ');
const FB112 = 'Maya mentioned a supplier that works well. Can you get Maya to send her price list link or the contact for the flour?';
check('FB-112: a request for information with no list gets no buttons, only typing', labels(FB112) === '' && !hasOptions(FB112) && needsQuestions(FB112).length === 1, labels(FB112));
check('...nor a choice an "or" seems to name', ['Release it now or later?', 'Ship it as alpha-21 or as alpha-22?', 'Which channel: alpha, beta or public?', 'Ship it or not?'].every((q) => labels(q) === ''));
check('the agent\'s own list: labels with ":" or "-" kept whole, its meaning after ": " or " - ", the recommended one', labels('Which one?\noptions:\n- alpha-25 (recommended): the next alpha\n- At 10:00: the morning slot\n- Re-run - the build again') === 'alpha-25|At 10:00|Re-run' && needsQuestions('Which one?\noptions:\n- alpha-25 (recommended): the next alpha\n- Re-run - the build again')[0]!.options.map((o) => `${o.recommended}:${o.detail}`).join('|') === 'true:the next alpha|false:the build again');
const any = needsQuestions('Which fixes go in?\noptions, any:\n- FB-112 (recommended): no made-up buttons\n- FB-113: one Send for a box');
check('..."options, any:" lets several be picked, (recommended) marked', any.length === 1 && any[0]!.many && any[0]!.options[0]!.recommended && any[0]!.options.map((o) => o.label).join('|') === 'FB-112|FB-113');
const es = needsQuestions('¿Publico la versión ahora?\nopciones:\n- Sí (recomendado): la publico ya\n- No: espera a mañana');
check('...in Spanish, "opciones:" and "(recomendado)"', es.length === 1 && es[0]!.options.map((o) => o.label).join('|') === 'Sí|No' && es[0]!.options[0]!.recommended && es[0]!.options[1]!.detail === 'espera a mañana', JSON.stringify(es));
const mixed = needsQuestions('1. Should I tell the Mail Agent?\noptions:\n- Yes: I tell it now\n- No: it waits for the release\n2. Can you send me the link to the build log or its settings?');
check('a box of several questions, one with no list (FB-113 with FB-112): buttons for the first, typing for the second', mixed.length === 2 && labels('1. Should I tell the Mail Agent?\noptions:\n- Yes: I tell it now\n- No: it waits for the release\n2. Can you send me the link to the build log or its settings?') === 'Yes|No / ', JSON.stringify(mixed));
check('...both answered in one message, each under its quote: a pick and a typed answer', picked(answerText([{ text: mixed[0]!.text, picks: ['Yes'] }, { text: mixed[1]!.text, picks: ['https://ci.example/log/42'] }]), mixed) === '[["Yes"],[]]' && answersIn(answerText([{ text: mixed[0]!.text, picks: ['Yes'] }]), mixed)[1]!.answered === false);
check('a list inside code is not the question\'s options', labels('Run this?\n```sh\noptions:\n- a\n- b\n```') === '');
const unmarked = 'Built and scanned.\n\nShould I hand it to the Mail Agent now?';
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
