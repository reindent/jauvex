// An order (node scripts/jauvex.ts settings, which agents run) only lowers what a provider's agents may do; raising is the user's, in the window.
import { orderMaySetProviderPermissions as may } from '../shared/types.ts';
let failed = 0; const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };
check('YOLO down to Auto or Ask: allowed', may('yolo', 'auto') && may('yolo', 'ask') && may('auto', 'ask'));
check('Ask or Auto up to YOLO: refused', !may('ask', 'yolo') && !may('auto', 'yolo') && !may('ask', 'auto'));
check('the same level again: allowed', may('auto', 'auto'));
check('each agent at its own: only Ask may be set for all', may(undefined, 'ask') && !may(undefined, 'auto') && !may(undefined, 'yolo'));
check('back to each agent\'s own: only from YOLO or from none', may('yolo', undefined) && may(undefined, undefined) && !may('ask', undefined) && !may('auto', undefined));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
