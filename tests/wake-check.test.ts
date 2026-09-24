// The wake phrase, heard while muted (electron/voice.ts: wakeCheck). The incident (2026-09-24): the small live-words whisper-server died, the
// app never started it again, and every check after that heard nothing ("0 words") in a millisecond: the user said his wake phrase over
// and over and the microphone stayed muted. A real whisper-server pair on ports of its own; skipped where there is none.
import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { existsSync, mkdirSync, readFileSync } from 'node:fs';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR = path.resolve('tmp/testdata-wake'); process.env.CVC_WHISPER_PORT = '4371'; process.env.CVC_LIVE_RETRY_MS = '1000';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const has = (cmd: string) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
if (!has('whisper-server') || !has('say') || !existsSync('models/ggml-base-q5_1.bin')) { console.log('PASS skipped: no whisper-server, say or base model on this machine'); console.log('ALL PASS'); process.exit(0); }
mkdirSync('tmp/testdata-wake', { recursive: true });
execFileSync('say', ['-o', 'tmp/testdata-wake/wake.aiff', 'Hakuna Matata']); execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', 'tmp/testdata-wake/wake.aiff', 'tmp/testdata-wake/wake.wav']);
const wav = readFileSync('tmp/testdata-wake/wake.wav'); const audio = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
const voice = await import('../electron/voice.ts');
const LIVE = 4372; const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const livePid = () => { try { return Number(execFileSync('lsof', ['-nP', '-t', `-iTCP:${LIVE}`, '-sTCP:LISTEN']).toString().trim().split(/\s+/)[0]) || 0; } catch { return 0; } };
const liveUp = async (ms: number) => { for (let t = 0; t < ms; t += 250) { try { if ((await fetch(`http://127.0.0.1:${LIVE}/`)).status < 500) { await sleep(1500); return true; } } catch { /* not yet */ } await sleep(250); } return false; };

voice.configureStt('ggml-base-q5_1.bin', ''); await voice.ensureWhisper();
check('the live-words server comes up', await liveUp(30_000));
const first = await voice.wakeCheck(audio, 'Hakuna Matata', 'auto');
check('muted, the wake phrase is heard', first.woke, JSON.stringify(first));

const pid = livePid(); const cmd = pid ? execFileSync('ps', ['-o', 'command=', '-p', String(pid)]).toString() : '';
if (pid && cmd.includes('whisper-server') && cmd.includes(`--port ${LIVE}`)) process.kill(pid, 'SIGKILL'); // the check's own server, by its pid
for (let t = 0; t < 5000 && livePid(); t += 100) await sleep(100);
check('the live-words server is gone (as on 2026-09-24)', !livePid());
const second = await voice.wakeCheck(audio, 'Hakuna Matata', 'auto');
check('with it gone, the wake phrase is still heard (the main Whisper hears it)', second.woke, JSON.stringify(second));
await sleep(1200); await voice.wakeCheck(audio, 'Hakuna Matata', 'auto');
check('and the live-words server starts again', await liveUp(30_000));
const log = readFileSync('tmp/testdata-wake/voice-debug.log', 'utf8');
check('the flight recorder says it stopped and who heard the phrase', /live words: the small whisper-server stopped/.test(log) && /heard by the main Whisper/.test(log), log.split('\n').filter((l) => /wake|live words/.test(l)).slice(-4).join(' | '));
voice.shutdown(); await sleep(500);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
