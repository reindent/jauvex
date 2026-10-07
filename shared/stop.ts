// A stop said out loud, as the busy triage reads it (Diego, 2026-10-07, as Jauvex Pro): Jev took a lone "Off." (a fragment of a longer
// sentence) for "stop" at 0.88 and cut a turn, with a message from another agent folded into it and never answered. The model's "stop"
// interrupts the work only when the words hold a stop word; otherwise they reach the turn as added information (AGENTS.md: only a clear
// "stop" or "not that, do X" interrupts).
export const STOP_SAID = /\b(stop|cancel|abort|halt|enough|wait|para|parar|detente|alto|cancela|cancelar|basta|espera)\b/i;
export type BusyAction = 'steer' | 'queue' | 'replace' | 'stop';
export const confirmStop = (action: BusyAction, text: string): BusyAction => (action === 'stop' && !STOP_SAID.test(text) ? 'steer' : action);
