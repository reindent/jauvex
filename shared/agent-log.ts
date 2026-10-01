// The agents' turns in the debugger (T-260; the user, 2026-10-01: "the debugger in the model part ... has only Jev. But it doesn't say
// anything that is going on with Claude or Codex or Grok. I want to be able to see that and that should be logged as well"). Pure: what a
// turn's start and each of its events become as lines of the Model tab and of voice-debug.log. The streamed text (delta) and the context
// meter's numbers say nothing a line would not say again: they make none.
import type { ChatEvent, DebugEvent, Provider } from './types.js';
import { PROVIDER_LABEL } from './types.js';

export type AgentLine = { text: string; detail?: string; ms?: number };
const DETAIL_MAX = 4000; // a long answer or tool output: its start is enough to see what happened
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
export const preview = (s: string, n = 160): string => { const f = flat(s); return f.length > n ? `${f.slice(0, n - 1)}…` : f; };
const cut = (s: string): string => (s.length > DETAIL_MAX ? `${s.slice(0, DETAIL_MAX)}\n… (${s.length - DETAIL_MAX} more characters)` : s);
const json = (v: unknown): string => { try { return JSON.stringify(v, null, 2) ?? ''; } catch { return String(v); } };

/** Who a line is about: the provider, the session's first characters and the folder ("Claude 3f2a1c · reindent"). */
export const agentWho = (provider: Provider, sessionId: string | null | undefined, folder: string): string =>
  `${PROVIDER_LABEL[provider]} ${sessionId ? sessionId.slice(0, 6) : 'new'} · ${folder}`;

/** What a tool call was about, in a few words: the command, the file, the pattern, the address. */
export const toolHint = (input: unknown): string => {
  if (!input || typeof input !== 'object') return typeof input === 'string' ? preview(input, 100) : '';
  const o = input as Record<string, unknown>;
  for (const k of ['command', 'cmd', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt', 'text']) if (typeof o[k] === 'string' && o[k]) return preview(o[k] as string, 100);
  return preview(json(input), 100);
};

/** The line for a turn that starts: what was sent, and with what. */
export const turnStart = (o: { text: string; model?: string; effort?: string; compact?: boolean; voice?: boolean; images?: number; hidden?: boolean }): AgentLine => {
  const how = [o.model && `model ${o.model}`, o.effort && `effort ${o.effort}`, o.voice && 'by voice', o.images && `${o.images} picture${o.images > 1 ? 's' : ''}`, o.hidden && 'hidden'].filter(Boolean).join(', ');
  return { text: `${o.compact ? 'compact asked' : 'turn starts'}${how ? ` (${how})` : ''}: "${preview(o.text)}"`, detail: cut(o.text) };
};

/** The line for a message handed to a running turn. */
export const steered = (text: string, images = 0): AgentLine => ({ text: `steered into the turn${images ? ` (${images} picture${images > 1 ? 's' : ''})` : ''}: "${preview(text)}"`, detail: cut(text) });

/** The lines one event of a turn makes: none, one, or one per part of a message. */
export function eventLines(ev: ChatEvent): AgentLine[] {
  switch (ev.type) {
    case 'init': return [{ text: `session ${ev.sessionId}${ev.model ? `, model ${ev.model}` : ''}` }];
    case 'message': {
      const m = ev.message; const out: AgentLine[] = [];
      if (m.role === 'system') { const t = m.blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' ').trim(); if (t) out.push({ text: `system: "${preview(t)}"`, detail: cut(t) }); return out; }
      for (const b of m.blocks) {
        if (m.role === 'assistant' && b.type === 'text' && b.text.trim()) out.push({ text: `${m.error ? 'error' : 'says'}: "${preview(b.text)}"`, detail: cut(b.text) });
        else if (m.role === 'assistant' && b.type === 'thinking' && b.text.trim()) out.push({ text: `thinks: "${preview(b.text)}"`, detail: cut(b.text) });
        else if (b.type === 'tool_use') out.push({ text: `calls ${b.name}${toolHint(b.input) ? `: ${toolHint(b.input)}` : ''}`, detail: cut(json(b.input)) });
        else if (b.type === 'tool_result') out.push({ text: `${b.isError ? 'tool failed' : 'tool result'}: "${preview(b.text) || '(empty)'}"`, detail: b.text ? cut(b.text) : undefined });
      }
      return out; // the user's own words were logged when the turn started
    }
    case 'permission': return [{ text: `asks permission for ${ev.toolName}${toolHint(ev.input) ? `: ${toolHint(ev.input)}` : ''}`, detail: cut(json(ev.input)) }];
    case 'status': return ev.text.trim() ? [{ text: `status: ${preview(ev.text)}` }] : [];
    case 'compact': return [{ text: ev.phase === 'start' ? `compacting (${ev.trigger ?? 'manual'})` : `compacted${ev.ok === false ? ` (failed: ${preview(ev.error ?? '', 120)})` : ''}${ev.before && ev.after ? `: ${ev.before} -> ${ev.after} tokens` : ''}` }];
    case 'done': {
      const bits = [ev.costUsd && `$${ev.costUsd.toFixed(4)}`, /* none, or nothing spent: no word */ ev.unsent && `${ev.unsent} message${ev.unsent > 1 ? 's' : ''} never read`, ev.tooLong && 'too long for the context window'].filter(Boolean).join(', ');
      return [{ text: `${ev.ok ? 'turn done' : `turn failed${ev.error ? `: ${preview(ev.error, 200)}` : ''}`}${bits ? ` (${bits})` : ''}`, ms: ev.durationMs, detail: !ev.ok && ev.error && ev.error.length > 200 ? cut(ev.error) : undefined }];
    }
    default: return []; // delta, context
  }
}

/** The events kept: the agents' lines fill the Model tab fast, so each tab keeps its own last ones (the voice's 300, the models' 600). */
export const KEEP = { model: 600, other: 300 };
export function keep(all: DebugEvent[], e: DebugEvent): DebugEvent[] {
  const next = [...all, e]; const model = e.kind === 'model'; const max = model ? KEEP.model : KEEP.other;
  let n = 0; for (const x of next) if ((x.kind === 'model') === model) n++;
  if (n <= max) return next;
  const i = next.findIndex((x) => (x.kind === 'model') === model); next.splice(i, 1); return next;
}
