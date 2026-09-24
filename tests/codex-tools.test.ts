// llm
import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// A Codex tool call shows the moment it starts (tool_use alone), and the same message comes back with its result when it completes.
const codex = await import('../electron/codex.ts'); const backend = await import('../electron/backend.ts');
const st = await backend.backend.state(); const p = st.projects.find((x) => x.name === 'scratch')!;
const seen: { uuid: string; blocks: string }[] = [];
await codex.startChat({ chatId: 'probe', projectId: p.id, sessionId: null, provider: 'codex', text: 'Run the shell command `echo probe-ok` and tell me its output. Nothing else.' }, (e) => { if (e.type === 'message') seen.push({ uuid: e.message.uuid, blocks: e.message.blocks.map((b) => b.type).join(',') }); });
const started = seen.find((m) => m.blocks === 'tool_use'); const completed = started && seen.find((m) => m.uuid === started.uuid && m.blocks === 'tool_use,tool_result');
console.log(started ? 'PASS the call showed as it started' : 'FAIL no tool_use-only message'); console.log(completed ? 'PASS the same message came back with its result' : 'FAIL no completed twin');
console.log(started && completed ? 'ALL PASS' : '1 FAILED'); codex.shutdown(); process.exit(started && completed ? 0 : 1);
