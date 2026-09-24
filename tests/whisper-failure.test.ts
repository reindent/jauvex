import path from 'node:path';
process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// whisperFailure: why whisper-server stopped, from what it printed, never the crash backtrace it prints on the way out (2026-09-24: the app
// said only "whisper-server exited (null). 9 dyld ... start + 6124" for a model an interrupted download had left incomplete).
const { whisperFailure } = await import('../electron/voice.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) failed++; };
const backtrace = `/private/tmp/ggml-20260626-5236-zw8xfu/ggml-0.15.3/src/ggml-metal/ggml-metal-device.m:622: GGML_ASSERT([rsets->data count] == 0) failed
WARNING: Using native backtrace. Set GGML_BACKTRACE_LLDB for more info.
0   libggml-base.0.15.3.dylib           0x000000010495d818 ggml_print_backtrace + 276
1   libggml-base.0.15.3.dylib           0x000000010499ef3c ggml_abort + 156
9   dyld                                0x000000019093acac _ZNK5dyld423LibSystemHelpersWrapper4exitEi + 172
10  dyld                                0x000000019093abc8 start + 6124
`;
const loading = `whisper_init_from_file_with_params_no_state: loading model from '/Applications/Jauvex.app/Contents/Resources/app/models/ggml-small-q5_1.bin'
whisper_model_load: model size    =   60.81 MB
whisper_model_load: ERROR not all tensors loaded from model file - expected 479, got 80
whisper_init_with_params_no_state: failed to load model
error: failed to initialize whisper context
`;
const small = '/Applications/Jauvex.app/Contents/Resources/app/models/ggml-small-q5_1.bin';
const noTrace = (s: string) => !/dyld|0x[0-9a-f]{6,}|GGML_ASSERT|backtrace/.test(s);
let s = whisperFailure(loading + backtrace, { model: small, port: 4341, code: null, signal: 'SIGABRT', installed: true });
check('an incomplete model, in the installed app: named, and the install command is the fix', s === 'ggml-small-q5_1.bin is incomplete or damaged, so Whisper cannot load it. Run the install command again: it downloads the model again', s);
s = whisperFailure(loading + backtrace, { model: '/x/models/ggml-large-v3-turbo-q5_0.bin', port: 4341, code: null, signal: 'SIGABRT', installed: true });
check('a model of the user\'s own: downloaded again by hand', s.endsWith('so Whisper cannot load it. Download it again') && s.startsWith('ggml-large-v3-turbo-q5_0.bin'), s);
s = whisperFailure(`whisper_model_load: model size    =  181.23 MB\n\ncouldn't bind to server socket: hostname=127.0.0.1 port=4341\n\n${backtrace}`, { model: small, port: 4341, code: null, signal: 'SIGABRT' });
check('a port that is taken', s.startsWith('port 4341 is taken by another program, so Whisper cannot start') && noTrace(s), s);
s = whisperFailure('error: unknown argument: --fast\n\nusage: whisper-server [options]\n  -h, --help   show this help message and exit\n', { model: small, port: 4341, code: 1, signal: null });
check('anything else: its own error line', s === 'whisper-server stopped (exit 1): error: unknown argument: --fast', s);
s = whisperFailure(backtrace, { model: small, port: 4341, code: null, signal: 'SIGABRT' });
check('nothing but a backtrace: the signal, and no backtrace', s === 'whisper-server stopped (SIGABRT)', s);
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
