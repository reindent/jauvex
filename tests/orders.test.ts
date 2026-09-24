// When the app carries out an order said to it and when it asks first (shared/orders.ts).
import { answerIs, orderVerdict, stopSaysMore } from '../shared/orders.ts';
let failed = 0; const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`); if (!ok) failed++; };

// The case that opened a new agent nobody asked for: Jev leaned to the agent (0.55, not sure), the voice model read an order.
check('Jev unsure and the voice model reads an order: the app asks, it does not act', orderVerdict({ jev: { forApp: false, confidence: 0.55 }, model: 'order' }) === 'ask');
check('the exact phrase ("restart the app") is carried out', orderVerdict({ exact: true }) === 'act');
check('Jev sure it is for the app: carried out', orderVerdict({ jev: { forApp: true, confidence: 0.9 } }) === 'act');
check('Jev leaning to the app but not sure: asked', orderVerdict({ jev: { forApp: true, confidence: 0.7 } }) === 'ask');
check('Jev sure enough it is for the agent: it goes to the agent', orderVerdict({ jev: { forApp: false, confidence: 0.7 } }) === 'pass');
check('Jev unsure and the voice model says it is not an order: it goes to the agent', orderVerdict({ jev: { forApp: true, confidence: 0.5 }, model: 'not' }) === 'pass');
check('no Jev, the voice model reads an order: asked', orderVerdict({ jev: null, model: 'order' }) === 'ask');
check('nobody to decide at all: asked, never carried out', orderVerdict({}) === 'ask');

check('"yes" is a yes', answerIs('Yes.') === 'yes');
check('"yeah, do it" is a yes', answerIs('Yeah, do it') === 'yes');
check('"no" is a no', answerIs('No.') === 'no');
check('"no, that was for the agent" is a no', answerIs('No, that was for the agent') === 'no');
check('a new sentence is neither', answerIs('I want the handoff written in the README with the next steps for the other agent') === null);
check('"not that" is a no', answerIs('Not that.') === 'no');
// A stop's words (2026-09-23): "list, list, list, before you do anything, stop" was dropped whole, and never shown.
check('a stop that asks for something carries its words on', stopSaysMore('Okay, wait a second. List, list, list. Before you do anything, stop.') && stopSaysMore('Stop, use the other folder instead.'));
check('a bare stop carries nothing', !stopSaysMore('Stop.') && !stopSaysMore('Stop, stop!') && !stopSaysMore('Hold on, stop that.') && !stopSaysMore('Okay, wait a second. Before you do anything, stop.') && !stopSaysMore('No no no, stop it now'));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
