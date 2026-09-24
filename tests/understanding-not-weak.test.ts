// llm
import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// Stage two on the smallest model is an understanding, never a bare quick line: it names what was asked.
const voice = await import('../electron/voice.ts'); voice.warmAck('claude', ''); await new Promise((r) => setTimeout(r, 2500));
const line = await voice.understand('Okay, please list the files in this folder and tell me which one is the biggest.', 'claude', '', 'Claude, model claude-opus-5');
const ok = line.split(/\s+/).length >= 7 && !/^\W*(sure|okay|got it)\W*(one (second|moment)|on it)?\W*$/i.test(line) && /file|folder|biggest|largest|list/i.test(line);
console.log(`${ok ? 'PASS' : 'FAIL'} the understanding names what was asked: "${line}"`); console.log(ok ? 'ALL PASS' : '1 FAILED'); voice.shutdown(); process.exit(ok ? 0 : 1);
