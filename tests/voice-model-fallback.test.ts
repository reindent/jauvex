import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// The voice's model comes from the live lists: automatic is the smallest, and a saved id that is not offered falls back to it, on both providers.
const voice = await import('../electron/voice.ts'); const codex = await import('../electron/codex.ts');
const claude = await voice.claudeModels(); const auto = voice.resolveVoiceModel('claude', ''); const gone = voice.resolveVoiceModel('claude', 'claude-nonexistent-9'); const kept = voice.resolveVoiceModel('claude', claude[0]?.id ?? '');
let bad = 0; const check = (name: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${d}`); if (!ok) bad++; };
check('Claude offers a list', claude.length > 0, claude.map((m) => m.id).join(', '));
check('automatic on Claude is the smallest (a Haiku)', /haiku/i.test(auto), auto);
check('an id that is gone falls back to it', gone === auto, gone);
check('an id that is offered is kept', kept === (claude[0]?.id ?? ''), kept);
const cauto = await codex.voiceModel(''); const cgone = await codex.voiceModel('gpt-nonexistent-1');
check('automatic on Codex is the fast one', /luna|fast|mini/i.test(cauto), cauto);
check('an id that is gone falls back to it', cgone === cauto, cgone);
console.log(bad ? `${bad} FAILED` : 'ALL PASS'); voice.shutdown(); codex.shutdown(); process.exit(bad ? 1 : 0);
