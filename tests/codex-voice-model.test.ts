import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// The voice's Codex model, set to automatic, is the account's fast and affordable one, not the big default.
const codex = await import('../electron/codex.ts');
const all = await codex.models(); const picked = await codex.voiceModel('');
const m = all.find((x) => x.id === picked); const fast = !!m && /fast|affordable|small|mini|lightweight/i.test((m as { description?: string }).description ?? '');
console.log(`${fast ? 'PASS' : 'FAIL'} automatic picks the fast one: ${picked || '(default)'}${m ? ` — ${(m as { description?: string }).description}` : ''}`);
console.log(fast ? 'ALL PASS' : '1 FAILED'); codex.shutdown(); process.exit(fast ? 0 : 1);
