import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Orb } from './Orb';
import { VoiceEngine, type VoicePhase } from './voice';
import { SIGN_IN_CLI, SIGN_IN_IN_APP, type AccountStatus, type Provider, type SetupCheck, type VoiceStatus } from '../../shared/types';
import { ProviderIcon } from './ProviderIcon';

/**
 * The first-run screen: the orb alone in the middle, a spoken welcome, and the checks a fresh Mac needs to pass before
 * the app can do anything (Claude or Codex signed in; whisper-server and a model for the voice; a TypeSafe key for Jev,
 * optional). Each check reports as it lands, in text and out loud. It opens by itself on the first run (over the main
 * window; `ui.welcomed` remembers that) and from Jauvex settings after. Taller than the window, it scrolls.
 */
type Row = { id: string; label: string; state: 'wait' | 'ok' | 'no' | 'opt'; detail: string; hint?: string; action?: { label: string; url?: string; run?: () => void }; say: string };
const SPOKEN_CONTENT = 'x-apple.systempreferences:com.apple.preference.universalaccess?SpokenContent'; // System Settings > Accessibility > Spoken Content
const SPOKEN_NAME = 'Javex'; // how the speech engine should say the name

export function Welcome({ onDone, defaultProvider, onDefault, jauvexMove, onJauvexMove }: { onDone: (start?: boolean) => void; defaultProvider: Provider | null; onDefault: (p: Provider) => void; jauvexMove: 'unified' | 'handoff'; onJauvexMove: (m: 'unified' | 'handoff') => void }) {
  const [rows, setRows] = useState<Row[]>([
    { id: 'say', label: 'Speech on this Mac', state: 'wait', detail: 'Looking for the say command', say: '' },
    { id: 'voice', label: 'Voice quality', state: 'wait', detail: 'Listening to the System voice', say: '' },
    { id: 'claude', label: 'Claude', state: 'wait', detail: 'Checking the sign-in', say: '' },
    { id: 'codex', label: 'Codex', state: 'wait', detail: 'Checking the sign-in', say: '' },
    { id: 'whisper', label: 'Voice recognition (Whisper)', state: 'wait', detail: 'Looking for whisper-server and a model', say: '' },
    { id: 'jev', label: 'Jev (TypeSafe)', state: 'wait', detail: 'Looking for a key', say: '' },
  ]);
  const [phase, setPhaseState] = useState<VoicePhase>('thinking'); const level = useRef(0); const setPhase = (p: VoicePhase) => { phaseRef.current = p; setPhaseState(p); };
  const [line, setLine] = useState<{ text: string; ms: number; at: number }>({ text: '', ms: 0, at: 0 });
  const [signed, setSigned] = useState<Provider[]>([]); const [chosen, setChosen] = useState<Provider | null>(defaultProvider); const signedRef = useRef<Provider[]>([]); signedRef.current = signed; const NAME = { claude: 'Claude', codex: 'Codex' } as const;
  /* The welcome listens once the checks are in (people talk to an orb that talks): start, Claude or Codex, or, with nobody signed
     in, the honest answer that it cannot reply yet. Whisper is warmed as soon as the screen opens so the ears are ready in time. */
  const engine = useRef<VoiceEngine | null>(null); const canAnswer = useRef(false); const chosenRef = useRef(chosen); chosenRef.current = chosen; const readyRef = useRef(false); const onDoneRef = useRef(onDone); onDoneRef.current = onDone; const onDefaultRef = useRef(onDefault); onDefaultRef.current = onDefault;
  const [heard, setHeard] = useState(''); const [ears, setEars] = useState(''); // what the ears are doing, on screen: listening, or why not (the flight recorder gets it too)
  const earsNote = (t: string) => { setEars(t); window.desktop.debugPush('note', `welcome ears: ${t}`); };
  const listen = async () => { if (engine.current || stopped.current) return;
    const e = new VoiceEngine({ level: (r) => { if (phaseRef.current !== 'speaking') level.current = Math.min(1, r * 6); }, speechStart: () => { stopSpeaking(); setPhase('hearing'); }, /* barge-in: the person talks, the welcome stops talking; the ears are never shut */ maybeEnd: () => {}, resumed: () => {}, dropped: () => { setPhase('thinking'); },
      end: (wav) => { void (async () => { setPhase('thinking'); const t = await window.desktop.transcribe(wav, 'en', false) /* the real transcription (small model, ghost filter, logged), not the live-words pass: that one heard "Quad" for Claude and "Thank you" for start */.catch((e: Error) => { earsNote(`I heard something but could not transcribe it: ${e.message}`); return { text: '' }; }); if (!t.text || stopped.current) return; const hw = t.text.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean); if (hw.length >= 4 && hw.every((w) => saidRef.current.toLowerCase().includes(w))) { window.desktop.debugPush('note', `welcome: heard its own line back, ignored: ${t.text}`); return; } setHeard(t.text); window.desktop.debugPush('heard', `welcome heard: ${t.text}`);
        if (!canAnswer.current) { await speak('Sorry, I cannot answer you yet: neither Claude nor Codex is signed in on this Mac. Sign in to one of them, in a terminal, and come back.'); return; }
        const i = await window.desktop.welcomeIntent(t.text).catch(() => ({ start: false, provider: null }));
        const avail = signedRef.current; const only = avail.length === 1 ? avail[0]! : null;
        // A provider that is not signed in is not a choice: with one provider there is only "start", and it starts with that one.
        if (i.provider && !avail.includes(i.provider)) { if (only && i.start && readyRef.current) { setChosen(only); onDefaultRef.current(only); stopped.current = true; onDoneRef.current(true); return; } await speak(only ? `${NAME[i.provider]} is not signed in here; I have ${NAME[only]}. Say start.` : `${NAME[i.provider]} is not signed in here.`); return; }
        if (i.provider) { setChosen(i.provider); onDefaultRef.current(i.provider); }
        const pick = i.provider ?? chosenRef.current ?? only;
        if (i.start && readyRef.current && pick) { if (pick !== chosenRef.current) { setChosen(pick); onDefaultRef.current(pick); } stopped.current = true; onDoneRef.current(true); return; }
        if (i.start && readyRef.current && !pick) { await speak('Claude or Codex? Say the one you want to start with.'); return; }
        if (i.provider) { await speak(`${NAME[i.provider]}. Say start.`); return; } /* short: the ears are shut while this is said */
        await speak(readyRef.current ? 'Say start, or press the button.' : 'Fix what is missing first; then I can hear you properly.'); })(); } });
    e.pauseMs = 800; e.minSpeechMs = 120; /* one short word ("start") must count as speech */
    try { await e.start(); engine.current = e; setPhase('listening'); const st = await window.desktop.voiceStatus().catch(() => null); const choices = signedRef.current.length > 1 ? 'Say "start", or "Claude" or "Codex".' : 'Say "start".'; earsNote(st && st.whisper !== 'ready' ? (st.whisper === 'starting' ? 'Listening; Whisper is still loading, give it a moment.' : `Listening, but Whisper is not working (${st.detail || st.whisper}): say it again once it is fixed.`) : `Listening. ${choices}`); }
    catch (err) { const m = (err as Error).message || ''; earsNote(/permission|denied|NotAllowed/i.test(m) ? 'I cannot hear you: microphone access is off for this app. Allow it in System Settings > Privacy & Security > Microphone, then reopen the welcome. The buttons still work.' : `I cannot hear you (${m || 'no microphone'}). The buttons still work.`); } };
  const phaseRef = useRef<VoicePhase>('thinking'); // the default agent: asked when both are signed in and none was chosen yet // typed out over `ms`, the length of the speech
  /* The entrance: the orb alone in the middle of the screen, a little bigger; after a beat it slides up into its place and
     shrinks; the title and the welcome line fade in under it and the welcome is spoken; then the checks appear. */
  const [stage, setStage] = useState<'orb' | 'up' | 'checks'>('orb'); const orbEl = useRef<HTMLDivElement>(null); const [dy, setDy] = useState(0);
  useLayoutEffect(() => { const r = orbEl.current?.getBoundingClientRect(); if (r) setDy(Math.round(window.innerHeight / 2 - (r.top + r.height / 2))); }, []);
  const set = (id: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  // Speech, one line after another, through the same `say` the voice uses, played here without the voice engine.
  const chain = useRef(Promise.resolve()); const stopped = useRef(false);
  const ctx = useRef<AudioContext | null>(null); const audio = () => (ctx.current ??= new AudioContext({ latencyHint: 'interactive' }));
  const speak = (text: string) => { chain.current = chain.current.then(async () => { if (stopped.current) return; const shown = text.split(SPOKEN_NAME).join('Jauvex'); /* the screen shows the real name, the speech engine gets the spelling it pronounces right */ const wav = await window.desktop.speak(text, '', 185).catch(() => null); if (stopped.current) return; if (!wav) { setLine({ text: shown, ms: 0, at: Date.now() }); return; }
    const ac = audio(); if (ac.state !== 'running') { try { await ac.resume(); } catch { /* below */ } }
    const note = (t: string) => window.desktop.debugPush('speech', `welcome: ${t}`);
    try { const buffer = await ac.decodeAudioData(wav.slice(0)); setPhase('speaking'); saidRef.current = text; setLine({ text: shown, ms: buffer.duration * 1000, at: Date.now() }); /* the words appear as they are said */ const t0 = ac.currentTime;
      const g = out.current ?? (out.current = (() => { const gn = ac.createGain(); gn.connect(ac.destination); return gn; })()); g.gain.cancelScheduledValues(ac.currentTime); g.gain.setValueAtTime(1, ac.currentTime);
      await new Promise<void>((done) => { const src = ac.createBufferSource(); src.buffer = buffer; src.connect(g); playing.current = src; src.onended = () => { if (playing.current === src) playing.current = null; done(); }; src.start(); ac.onstatechange = () => { if (ac.state === 'closed') done(); }; });
      note(`${ac.state === 'closed' ? 'cut after' : 'played'} ${(ac.state === 'closed' ? ac.currentTime - t0 : buffer.duration).toFixed(1)} s: "${text.slice(0, 60)}"`); } catch (e) { setLine({ text: shown, ms: 0, at: Date.now() }); note(`could not play: ${(e as Error).message}`); }
    setPhase(engine.current ? 'listening' : 'thinking'); }); return chain.current; };
  const out = useRef<GainNode | null>(null); const playing = useRef<AudioBufferSourceNode | null>(null); const saidRef = useRef('');
  const stopSpeaking = () => { const ac = ctx.current, src = playing.current, g = out.current; if (!ac || !src || !g) return; g.gain.cancelScheduledValues(ac.currentTime); g.gain.setValueAtTime(g.gain.value, ac.currentTime); g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.12); setTimeout(() => { try { src.stop(); } catch { /* ended */ } }, 140); };

  useEffect(() => {
    // A provider signed in after the checks: by the in-app sign-in (hidden in this edition), or by its own command line, then Check again.
    const signedInNow = (provider: Provider) => void window.desktop.accountStatus(provider).then((st) => { if (stopped.current) return; if (!st.signedIn) { set(provider, { state: 'no', detail: `${provider === 'claude' ? 'Claude' : 'Codex'} is still not signed in. Sign in with ${SIGN_IN_CLI[provider].tool}, in Terminal, then check again.` }); return; } const e = { provider }; set(e.provider, { state: 'ok', detail: `${e.provider === 'claude' ? 'Claude' : 'Codex'} is signed in${st.who ? ` as ${st.who}` : ''}.`, action: undefined }); setSigned((x) => (x.includes(e.provider) ? x : [...x, e.provider])); if (!chosenRef.current) { setChosen(e.provider); onDefaultRef.current(e.provider); } canAnswer.current = true; readyRef.current = rows.find((r) => r.id === 'whisper')?.state !== 'no'; void speak(`${e.provider === 'claude' ? 'Claude' : 'Codex'} is signed in. Say start, or press the button.`); });
    const offAccount = window.desktop.onAccountEvent((e) => { if (e.type !== 'done' || !e.ok) return; signedInNow(e.provider); });
    stopped.current = false; window.desktop.welcomeAudio(true); /* the window is muted until voice mode is on; the welcome must be heard without it */
    void window.desktop.voiceOn(true, 'welcome').catch(() => {}); /* the ears warm up (Whisper, the microphone permission) while the checks run */
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      await wait(1100); if (stopped.current) return; setStage('up'); await wait(900); if (stopped.current) return;
      await speak(`Welcome to ${SPOKEN_NAME}: your coding agents, side by side, by voice. One moment, I am checking your computer.`); if (stopped.current) return; setStage('checks'); await wait(300);
      const [setup, claude, codex] = await Promise.all([window.desktop.setupCheck().catch(() => null), window.desktop.accountStatus('claude').catch(() => null), window.desktop.accountStatus('codex').catch(() => null)]) as [SetupCheck | null, AccountStatus | null, AccountStatus | null];
      /* The checks come back almost at once; the rows land one after another anyway, each after a short visible wait,
         so the person sees each one being checked, and the Start button only after the last one. */
      const land = async (id: string, patch: Partial<Row>) => { await new Promise((r) => setTimeout(r, 650)); if (stopped.current) return; set(id, patch); };
      await land('say', setup?.say ? { state: 'ok', detail: 'The say command is here, so I can talk.' } : { state: 'no', detail: 'No say command: speech needs macOS.', hint: 'This version runs on macOS only.' });
      await land('voice', setup?.voice === 'basic' ? { state: 'opt', detail: 'The System voice is the basic Samantha, which sounds robotic. Pick a Siri voice: System Settings > Accessibility > Spoken Content > System voice. An app cannot choose it for you.', action: { label: 'Open Spoken Content', url: SPOKEN_CONTENT } } : setup?.voice === 'natural' ? { state: 'ok', detail: 'A natural voice is set as the System voice.' } : { state: 'opt', detail: 'Could not tell which voice is set. If it sounds robotic, pick a Siri voice in Spoken Content.', action: { label: 'Open Spoken Content', url: SPOKEN_CONTENT } });
      const cl = claude?.signedIn ? `Claude is signed in${claude.who ? ` as ${claude.who}` : ''}.` : 'Claude is not signed in.';
      const byCli = (p: Provider, said: string) => ({ state: 'no' as const, detail: `${said} Sign in with ${SIGN_IN_CLI[p].tool}, in Terminal, then check again.`, hint: SIGN_IN_CLI[p].login, action: { label: 'Check again', run: () => signedInNow(p) } });
      await land('claude', claude?.signedIn ? { state: 'ok', detail: cl } : !SIGN_IN_IN_APP ? byCli('claude', cl) : { state: 'no', detail: `${cl} Click Sign in: a browser page opens, use your Claude account. No terminal needed.`, action: { label: 'Sign in to Claude', run: () => void window.desktop.accountLogin('claude') } });
      const cx = codex?.signedIn ? `Codex is signed in${codex.who ? ` as ${codex.who}` : ''}.` : 'Codex is not signed in.';
      await land('codex', codex?.signedIn ? { state: 'ok', detail: cx } : !SIGN_IN_IN_APP ? byCli('codex', cx) : { state: 'no', detail: `${cx} Click Sign in: a browser page opens, use your ChatGPT account.${claude?.signedIn ? ' Or later, with the Jauvex agent.' : ' No terminal needed.'}`, action: { label: 'Sign in to Codex', run: () => void window.desktop.accountLogin('codex') } });
      /* Ready means its server answered: a model file can be there and still be one Whisper cannot load (2026-09-24, on a new Mac: "Whisper
         is ready" was said while the server had just failed). It has been starting since the screen opened. */
      const server = async (): Promise<VoiceStatus | null> => { set('whisper', { detail: 'Starting Whisper' }); for (let i = 0; i < 90 && !stopped.current; i++) { const st = await window.desktop.voiceStatus().catch(() => null); if (st && st.whisper !== 'starting') return st; await wait(700); } return null; };
      const up = setup?.whisperBinary && setup.models.length ? await server() : null; if (stopped.current) return;
      const wh = !setup?.whisperBinary ? { state: 'no' as const, detail: 'whisper-server is not installed, so I cannot hear you yet.', hint: 'brew install whisper-cpp, then download a model into the models folder (see the README)' } : !setup.models.length ? { state: 'no' as const, detail: 'whisper-server is here, but there is no model to listen with.', hint: 'Download a model into the models folder (see the README)' } : up?.whisper === 'ready' ? { state: 'ok' as const, detail: `Whisper is ready with ${setup.models.length} model${setup.models.length > 1 ? 's' : ''}.` } : { state: 'no' as const, detail: `I cannot hear you yet: ${up?.detail || 'Whisper did not answer within a minute'}.` };
      await land('whisper', wh);
      await land('jev', setup?.jevKey ? { state: 'ok', detail: 'A TypeSafe key is here: Jev makes the fast decisions.' } : { state: 'opt', detail: 'No TypeSafe key: the voice model decides instead. Optional.', hint: 'Put a key in ~/.typesafe/token or TYPESAFE_API_KEY to use Jev' });
      // Then say it, as one short report.
      const agents = claude?.signedIn && codex?.signedIn ? 'Claude and Codex are both signed in.' : claude?.signedIn ? 'Only Claude is signed in; it is the default. Say start.' : codex?.signedIn ? 'Only Codex is signed in; it is the default. Say start.' : `Neither Claude nor Codex is signed in yet, and I need at least one. ${SIGN_IN_IN_APP ? 'Click Sign in on a row.' : 'Sign in with its own command line, in Terminal: the command is on screen.'}`;
      const whisperLine = wh.state === 'ok' ? 'Whisper is ready.' : setup?.whisperBinary && setup.models.length ? 'Whisper could not start, so I cannot hear you yet: the reason is on screen.' : setup?.whisperBinary ? 'Whisper is installed but has no model yet, so I cannot hear you until one is downloaded.' : 'Whisper is not installed yet, so for now you can type; install it to talk to me.';
      const voiceLine = setup?.voice === 'basic' ? 'My voice is the basic one on this Mac and sounds robotic: pick a Siri voice in Spoken Content, the button is on screen.' : '';
      const jevLine = setup?.jevKey ? 'Jev is here.' : 'Jev is optional; without a key, I decide a little more slowly.';
      const ready = (claude?.signedIn || codex?.signedIn) && wh.state === 'ok'; readyRef.current = !!ready; canAnswer.current = !!(claude?.signedIn || codex?.signedIn);
      if (wh.state === 'ok' && !stopped.current) void listen(); /* the ears open now, so "start" said right after the closing line is heard */
      const both = !!(claude?.signedIn && codex?.signedIn); const one = claude?.signedIn ? 'claude' : codex?.signedIn ? 'codex' : null;
      setSigned([...(claude?.signedIn ? ['claude' as const] : []), ...(codex?.signedIn ? ['codex' as const] : [])]);
      if (!both && one && !defaultProvider) { setChosen(one); onDefault(one); } // one signed in: no question
      const ask = both && !defaultProvider ? ' Which one do you want to start with, Claude or Codex?' : '';
      await speak(`${agents} ${voiceLine} ${whisperLine} ${jevLine} ${ready ? (ask ? ask.trim() : 'Say start, or press the button.') : 'Fix what is missing, and I will be here.'}`); /* short: the ears are shut while this is said */
    })();
    return () => { offAccount(); stopped.current = true; engine.current?.stop(); engine.current = null; void window.desktop.voiceOn(false, 'welcome').catch(() => {}); window.desktop.welcomeAudio(false); void ctx.current?.close(); ctx.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allDone = rows.every((r) => r.state !== 'wait'); const ready = allDone && rows.filter((r) => r.state === 'no').every((r) => r.id === 'codex' || r.id === 'claude') && rows.some((r) => (r.id === 'claude' || r.id === 'codex') && r.state === 'ok') && rows.find((r) => r.id === 'whisper')?.state === 'ok';
  return (
    <div className={`welcome ${phase} stage-${stage}`} role="dialog" aria-label="Welcome" style={{ '--orb-dy': `${dy}px` } as CSSProperties}>
      <button className="welcome-close" title="Close" onClick={() => { stopped.current = true; onDone(); }}>Skip</button>
      <div className="welcome-orb" ref={orbEl}><Orb size={168} level={level} phase={phase} /></div>
      <h1 className="welcome-text">Welcome to Jauvex</h1>
      <p className="welcome-line welcome-text"><Typed key={line.at} text={line.text} ms={line.ms} /></p>
      {(heard || ears) && <p className="welcome-heard welcome-later">{heard ? `“${heard}”` : ''}{heard && ears ? ' · ' : ''}<span>{ears}</span></p>}
      <ul className="welcome-checks welcome-later">
        {rows.map((r) => <li key={r.id} className={`w-${r.state}`}><span className="w-dot" /><div><b>{r.label}</b><span>{r.detail}</span>{r.state !== 'ok' && (r.hint || r.action) && <div className="w-do">{r.hint && <code>{r.hint}</code>}{r.action && <button className="welcome-act" onClick={() => { const a = r.action!; if (a.run) a.run(); else if (a.url) void window.desktop.openExternal(a.url); }}>{r.action.label}</button>}</div>}</div></li>)}
      </ul>
      {allDone && signed.length > 1 && <div className="welcome-pick welcome-later"><span>Start with</span>{signed.map((p) => <button key={p} className={chosen === p ? 'on' : ''} onClick={() => { setChosen(p); onDefault(p); }}><ProviderIcon provider={p} size={13} />{p === 'claude' ? 'Claude' : 'Codex'}</button>)}<em>the default agent, changeable in Jauvex settings</em></div>}
      {allDone && signed.length > 1 && <div className="welcome-pick welcome-move welcome-later"><span>When the Jauvex agent moves between them</span>{([['unified', 'Unified, experimental'], ['handoff', 'Handover']] as const).map(([k, label]) => <button key={k} className={jauvexMove === k ? 'on' : ''} title={k === 'unified' ? 'The app replays the whole conversation to the other provider. Experimental: more can break.' : 'The leaving agent writes a handover note; the next one continues from it.'} onClick={() => onJauvexMove(k)}>{label}</button>)}<em>changeable in Jauvex settings</em></div>}
      <div className="welcome-foot welcome-later">{allDone ? <button className="welcome-go" disabled={(ready && signed.length > 1 && !chosen) || signed.length === 0} title={signed.length === 0 ? 'Sign in to Claude or Codex first: the app needs at least one' : ready && signed.length > 1 && !chosen ? 'Pick the agent to start with' : ''} onClick={() => { stopped.current = true; onDone(ready); }}>{signed.length === 0 ? 'Sign in to Claude or Codex to start' : ready ? 'Start' : 'Continue anyway'}</button> : <span className="welcome-wait"><span className="w-dot" />Checking…</span>}</div>
    </div>
  );
}

/** Text that appears as it is spoken: `text` typed out over `ms`, like the voice line in a conversation. */
function Typed({ text, ms }: { text: string; ms: number }) {
  const [n, setN] = useState(ms ? 0 : text.length);
  useEffect(() => { if (!ms) { setN(text.length); return; } const t0 = performance.now(); let raf = 0;
    const tick = () => { const k = Math.min(text.length, Math.ceil(((performance.now() - t0) / Math.max(300, ms * 0.94)) * text.length)); setN(k); if (k < text.length) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [text, ms]);
  return <>{text.slice(0, n)}{n < text.length && <i className="caret" />}</>;
}
