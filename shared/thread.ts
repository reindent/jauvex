// The thread as someone who is not a developer reads it (T-247; the user, 2026-09-30: "When it's disabled, then the users will not see bash
// and all these tool calls ... They would just see ... working ... unless they click it ... it's for non-technical users"): what was said and
// written, the pictures a tool made, and each run of tool calls, thoughts and system events between them as one Working row. Pure:
// tests/work-rows.test.ts.
import type { Block, ChatMessage } from './types.js';

/** A tool call or a thought (b), or a whole system event. */
export type WorkPart = { m: ChatMessage; b?: Block };
export type ThreadUnit = { kind: 'msg'; key: string; m: ChatMessage } | { kind: 'work'; key: string; parts: WorkPart[] } | { kind: 'media'; key: string; src: string } | { kind: 'agents'; key: string; names: string[]; units: ThreadUnit[] };

/** A picture a tool made (Grok's imagine): its path. */
export const toolImage = (b: Block): string | null => { if (b.type !== 'tool_use') return null; const image = (b.input as { image?: unknown } | null)?.image; return typeof image === 'string' && image.startsWith('/') ? image : null; };

/** The thread's units, in order: a message (or the words of one), a picture a tool made, a run of work. */
export function threadUnits(messages: ChatMessage[], showMeta: boolean): ThreadUnit[] {
  const out: ThreadUnit[] = []; let work: WorkPart[] = [];
  const flush = () => { if (work.length) { const f = work[0]!; out.push({ kind: 'work', key: `work:${f.m.uuid}:${f.b && 'id' in f.b ? f.b.id : out.length}`, parts: work }); work = []; } };
  for (const m of messages) {
    if (m.meta) { if (showMeta) work.push({ m }); continue; }
    if (m.role !== 'assistant' || m.error || m.voice) { flush(); out.push({ kind: 'msg', key: m.uuid, m }); continue; }
    let text: Block[] = []; let n = 0;
    const said = () => { if (!text.length) return; flush(); out.push({ kind: 'msg', key: `${m.uuid}:${n++}`, m: { ...m, blocks: text } }); text = []; };
    for (const b of m.blocks) {
      if (b.type === 'text') { text.push(b); continue; }
      if (b.type !== 'tool_use' && b.type !== 'thinking') continue;
      said(); work.push({ m, b });
      const image = toolImage(b); if (image) { flush(); out.push({ kind: 'media', key: `media:${m.uuid}:${'id' in b ? b.id : n++}`, src: image }); }
    }
    said();
  }
  flush(); return out;
}

/** Agent-to-agent traffic folded into one line in the person's chat (FB-14, as Jauvex Pro; a Pro user, 2026-10-05: a lead's reply to them was buried under its
 *  messages with other agents): each run of messages from agents, answers to them and the work between, as one `agents` unit naming them.
 *  `agentOf` says whose a message unit is (an agent's name), or null when it is the person's or for the person. A run that holds no agent
 *  message is left as it was; work at a run's edges stays outside it. */
export function foldAgents(units: ThreadUnit[], agentOf: (u: ThreadUnit) => string | null): ThreadUnit[] {
  const out: ThreadUnit[] = []; let run: ThreadUnit[] = []; let names: string[] = [];
  const close = () => { let tail: ThreadUnit[] = []; while (run.length && run[run.length - 1]!.kind === 'work') tail = [run.pop()!, ...tail];
    if (names.length) out.push({ kind: 'agents', key: `agents:${run[0]!.key}`, names, units: run }); else out.push(...run); out.push(...tail); run = []; names = []; };
  for (const u of units) {
    const who = u.kind === 'msg' ? agentOf(u) : null;
    if (who) { run.push(u); if (!names.includes(who)) names.push(who); continue; }
    if (u.kind === 'work' && names.length) { run.push(u); continue; }
    close(); out.push(u);
  }
  close(); return out;
}
