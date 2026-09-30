// A message handed to an agent while its turn is under way (T-228; the user, 2026-09-29: an agent's answer landed in the chat of another agent
// that had asked it a question meanwhile). A chat keeps one address for its turn's answer; a message handed to the turn under way took that
// address, and the answer went to whoever wrote last. Words of the person at the chat still join the turn (steering); a message that wants
// its own answer waits for a turn of its own: a workflow's step (its outcome), a reply the app asked for, or another agent's message while
// the turn answers someone else.
type Address = { kind?: string; key: string };

/** Whether a message for `to`, delivered while a turn answers `current`, waits for a turn of its own. */
export const ownTurn = (to: Address, current?: Address): boolean =>
  to.kind === 'run' || to.kind === 'export' || (!!current && current.key !== to.key);
