import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// "Make a new Grok agent" said out loud opens a Grok agent (T-133): the kind is read from the words (grog, as speech-to-text may write it,
// is Grok by then: fixNames), and a new chat opens on the provider the order named.
const voice = await import('../electron/voice.ts'); const jev = await import('../electron/jev.ts'); jev.warm(); await new Promise((r) => setTimeout(r, 1500));
const projects = [{ id: 'p1', name: 'homepage' }, { id: 'p2', name: 'billing' }];
let bad = 0; const cases: [string, string][] = [['Make a new Grok agent.', 'grok'], ['Create a new grog agent in the billing project.', 'grok'], ['Make a new Codex agent.', 'codex'], ['Open a new Claude agent in billing.', 'claude']];
for (const [said, want] of cases) {
  const text = voice.fixNames(said); const cmd = await voice.command(text, projects, 'p1'); const order = (cmd && 'order' in cmd ? (cmd as { order?: { provider?: string } }).order : cmd) as { type?: string; provider?: string } | null;
  const ok = order?.type === 'new-agent' && order.provider === want || (cmd?.type === 'confirm' && JSON.stringify(cmd).includes(`"provider":"${want}"`)); if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'BAD '} ${JSON.stringify(said)} -> ${cmd ? `${cmd.type} ${JSON.stringify(cmd).slice(0, 160)}` : 'no command'}`);
}
console.log(bad ? `${bad} FAILED` : 'ALL PASS'); voice.shutdown(); process.exit(bad ? 1 : 0);
