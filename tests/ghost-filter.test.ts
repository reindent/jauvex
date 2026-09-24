import path from 'node:path'; process.env.CVC_ROOT = path.resolve('.'); process.env.CVC_DATA_DIR ??= path.resolve('tmp/testdata');
// Whisper's own no-speech score alone never drops a real sentence: a short greeting padded with silence scored 0.74 with every
// word right and vanished from the bubble. Short, doubtful or ghost-phrase text is still dropped on it.
const { ghost } = await import('../electron/voice.ts');
let failed = 0; const check = (name: string, ok: boolean, got: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}`); if (!ok) failed++; };
const seg = (no_speech_prob: number, avg_logprob: number) => [{ text: 'x', no_speech_prob, avg_logprob }];
check('a full sentence Whisper was sure of is kept at 0.74 no-speech', ghost('Hey there, how are you doing?', seg(0.74, -0.15)) === '', ghost('Hey there, how are you doing?', seg(0.74, -0.15)));
check('a full sentence is kept even at 0.9 no-speech when the words are confident', ghost('Please list the files in this folder for me.', seg(0.9, -0.2)) === '', ghost('Please list the files in this folder for me.', seg(0.9, -0.2)));
check('the classic ghost "Thank you." at 0.89 is dropped', ghost('Thank you.', seg(0.89, -0.3)) !== '', ghost('Thank you.', seg(0.89, -0.3)));
check('three words at 0.8 no-speech are dropped', ghost('you know what', seg(0.8, -0.2)) !== '', ghost('you know what', seg(0.8, -0.2)));
check('a long sentence is kept even with poor scores: losing speech is the worst failure', ghost('and then the thing went over there somewhere', seg(0.85, -0.7)) === '', ghost('and then the thing went over there somewhere', seg(0.85, -0.7)));
check('a trailing-off sentence at -0.83 confidence is kept', ghost('And then in the end it returns a...', seg(0.05, -0.83)) === '', ghost('And then in the end it returns a...', seg(0.05, -0.83)));
check('only garbled long text goes, at -1.6 confidence', ghost('sdf kjh qwe rty uio pas dfg', seg(0.2, -1.6)) !== '', ghost('sdf kjh qwe rty uio pas dfg', seg(0.2, -1.6)));
check('real speech at 0.01 no-speech is kept', ghost('Okay, one more agent for the billing page.', seg(0.01, -0.1)) === '', ghost('Okay, one more agent for the billing page.', seg(0.01, -0.1)));
check('a knock: gibberish at -0.9 confidence is dropped', ghost('sdfk jdk asld', seg(0.2, -0.9)) !== '', ghost('sdfk jdk asld', seg(0.2, -0.9)));
check('"Thank you for your time." is dropped even when Whisper was sure of it (it joined a real message)', ghost('Thank you for your time.', seg(0.0, -0.2)) !== '', ghost('Thank you for your time.', seg(0.0, -0.2)));
check('"Thanks for watching!" and a subscribe line are dropped whatever the score', ghost('Thanks for watching!', seg(0.0, -0.1)) !== '' && ghost("Don't forget to subscribe to the channel.", seg(0.0, -0.1)) !== '', '');
check('a sentence that only contains those words is kept', ghost('Thank you for your time on the review, now fix the build.', seg(0.0, -0.2)) === '', ghost('Thank you for your time on the review, now fix the build.', seg(0.0, -0.2)));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
