// The Jauvex agent's chat as the app keeps it is never lost to saves that overlap (T-269, from the other edition's fix; the user, 2026-10-01,
// of an agent there: "Reindent Agent lost its chat???": its transcript held one message, written the second a burst of replies came in).
// Every save read the whole file, added its message and wrote the whole file back: saves that overlapped dropped each other's message, and
// one that read the file while another was writing it found it half written, took it for a first message, and wrote that alone. The same for
// the chats' notes. Quick: the backend alone, on this check's own data folder.
import fs from 'node:fs'; import path from 'node:path';
const { backend } = await import('../electron/backend.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const DATA = process.env.CVC_DATA_DIR!; const words = 'the agent answered with a long paragraph about the work so far '.repeat(20);
const entry = (n: string) => ({ message: { uuid: n, role: 'assistant' as const, blocks: [{ type: 'text' as const, text: `${n}: ${words}` }], meta: false }, provider: 'claude' as const, at: Date.now() });
const log = path.join(DATA, 'jauvex-transcript.json'); fs.mkdirSync(DATA, { recursive: true });
// a long conversation already (about 4 MB, as a busy agent's), then forty saves at once: a burst of replies, each with its tool calls
fs.writeFileSync(log, JSON.stringify(Array.from({ length: 3000 }, (_, i) => entry(`old-${i}`))));
await Promise.all(Array.from({ length: 40 }, (_, i) => backend.jauvexAppend(entry(`new-${i}`))));
const after = await backend.jauvexTranscript(); const uuids = new Set(after.map((e) => e.message.uuid));
check("forty saves at once on the Jauvex agent's long chat: every message is kept, the old ones and the forty new", after.length === 3040 && uuids.has('old-0') && Array.from({ length: 40 }, (_, i) => `new-${i}`).every((u) => uuids.has(u)), `${after.length} messages, old-0 ${uuids.has('old-0') ? 'kept' : 'lost'}, new ones kept: ${Array.from({ length: 40 }, (_, i) => `new-${i}`).filter((u) => uuids.has(u)).length}`);
await Promise.all(Array.from({ length: 30 }, (_, i) => backend.noteAppend('s-notes', [{ after: `u-${i}`, message: entry(`n-${i}`).message }])));
check("a chat's notes: thirty saves at once, thirty notes", (await backend.notes('s-notes')).length === 30, String((await backend.notes('s-notes')).length));
// a file that cannot be read is never written over as if it were a first message: it is kept aside, whole
fs.writeFileSync(log, '[{"message": {"uuid": "cut-off-here');
await backend.jauvexAppend(entry('next')).catch(() => {});
const aside = fs.readdirSync(DATA).filter((n) => /^jauvex-transcript\.unreadable-\d+\.json$/.test(n));
check('a chat file that cannot be read is kept aside as it was, never written over', aside.length === 1 && fs.readFileSync(path.join(DATA, aside[0]!), 'utf8').startsWith('[{"message": {"uuid": "cut-off-here'), JSON.stringify(fs.readdirSync(DATA)));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
