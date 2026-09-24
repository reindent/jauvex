import { useEffect, useState } from 'react';
import { PROVIDER_LABEL, PROVIDERS, SIGN_IN_CLI, SIGN_IN_IN_APP, type AccountEvent, type AccountStatus, type Provider } from '../../shared/types';

// Who each provider is signed in as, with sign out / sign in / switch, from inside the app. Sign-in is the provider's own
// browser flow; whatever it prints shows here, and if it asks for something (a pasted code) it can be typed here.
type Flow = { lines: string[]; url?: string; done?: { ok: boolean; error?: string } };
export function Accounts({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Partial<Record<Provider, AccountStatus>>>({});
  const [flows, setFlows] = useState<Partial<Record<Provider, Flow>>>({});
  const [busy, setBusy] = useState<Partial<Record<Provider, string>>>({});
  const [reply, setReply] = useState('');
  const load = (p: Provider) => window.desktop.accountStatus(p).then((s) => setStatus((m) => ({ ...m, [p]: s }))).catch(() => {});
  useEffect(() => { for (const p of PROVIDERS) void load(p); }, []);
  useEffect(() => window.desktop.onAccountEvent((e: AccountEvent) => {
    setFlows((m) => { const f = m[e.provider] ?? { lines: [] }; return { ...m, [e.provider]: e.type === 'line' ? { ...f, lines: [...f.lines.slice(-30), e.text] } : e.type === 'url' ? { ...f, url: e.url } : { ...f, done: { ok: e.ok, ...(e.error ? { error: e.error } : {}) } } }; });
    if (e.type === 'url') void window.desktop.openExternal(e.url);
    if (e.type === 'done') { setBusy((m) => ({ ...m, [e.provider]: undefined })); void load(e.provider); }
  }), []);
  const signOut = async (p: Provider) => { setBusy((m) => ({ ...m, [p]: 'Signing out…' })); try { setStatus((m) => ({ ...m, [p]: undefined })); const s = await window.desktop.accountLogout(p); setStatus((m) => ({ ...m, [p]: s })); } finally { setBusy((m) => ({ ...m, [p]: undefined })); } };
  const signIn = async (p: Provider) => { setFlows((m) => ({ ...m, [p]: { lines: [] } })); setBusy((m) => ({ ...m, [p]: 'Signing in…' })); const ok = await window.desktop.accountLogin(p); if (!ok) setBusy((m) => ({ ...m, [p]: undefined })); };
  const switchTo = async (p: Provider) => { await signOut(p); await signIn(p); };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal accounts" role="dialog" aria-label="Accounts" onClick={(e) => e.stopPropagation()}>
        <h2>Accounts</h2>
        <p className="muted">The app uses the account each provider's own tool is signed in to on this Mac. {SIGN_IN_IN_APP ? '' : 'To sign in, out or switch, use that tool in Terminal, then Refresh here. '}Sessions are files here: they stay whichever account is signed in. Switch while nothing is running; a running turn keeps the old account until it ends.</p>
        {PROVIDERS.map((p) => { const s = status[p]; const f = flows[p]; const b = busy[p]; return (
          <section key={p} className="account">
            <div className="account-head"><strong>{PROVIDER_LABEL[p]}</strong>
              {b ? <span className="muted">{b}</span> : !s ? <span className="muted">Checking…</span> : s.error ? <span className="warn">{s.error}</span> : s.signedIn ? <span>{s.who || 'Signed in'}{s.plan ? <em className="muted"> · {s.plan}</em> : null}{s.method && !s.plan ? <em className="muted"> · {s.method}</em> : null}</span> : <span className="muted">Not signed in</span>}
            </div>
            <div className="account-actions">
              {!SIGN_IN_IN_APP ? <code className="account-cli" title={`${SIGN_IN_CLI[p].tool}'s own command line, in Terminal${s?.signedIn ? '' : `; no ${SIGN_IN_CLI[p].tool} yet: ${SIGN_IN_CLI[p].install}`}`}>{s?.signedIn ? SIGN_IN_CLI[p].logout : SIGN_IN_CLI[p].login}</code>
                : b ? <button onClick={() => void window.desktop.accountCancel(p)}>Cancel</button>
                : s?.signedIn ? <><button onClick={() => void switchTo(p)}>Switch account…</button><button onClick={() => void signOut(p)}>Sign out</button></>
                : <button onClick={() => void signIn(p)}>Sign in…</button>}
              <button onClick={() => void load(p)} title="Check again">Refresh</button>
            </div>
            {f && (f.lines.length > 0 || f.url || f.done) && (
              <div className="account-flow">
                {f.url && <p>Browser opened. If it did not: <a href={f.url} onClick={(e) => { e.preventDefault(); void window.desktop.openExternal(f.url!); }}>open the sign-in page</a></p>}
                {f.lines.map((l, i) => <p key={i} className="mono">{l}</p>)}
                {b && p === 'claude' && <form onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { void window.desktop.accountReply(p, reply.trim()); setReply(''); } }}><input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="If it asks for a code, paste it here and press Enter" /></form>}
                {f.done && <p className={f.done.ok ? 'ok' : 'warn'}>{f.done.ok ? 'Signed in.' : `Not signed in${f.done.error ? `: ${f.done.error}` : ''}`}</p>}
              </div>
            )}
          </section>); })}
        <div className="modal-foot"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
