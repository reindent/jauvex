// Open models in Accounts (1.8.0): the user's own model server, set up once: a preset fills the address of Ollama, LM Studio, vLLM or
// OpenRouter; a key when the server needs one (kept by the app, never shown again); "List models" asks the server first, so a wrong address or
// key says so before anything is saved; the model agents use unless they pick another in the message box's menu.
import { useEffect, useState } from 'react';
import { t } from '../../shared/i18n';
import { OPEN_PRESETS, cleanBaseUrl, type OpenModelsView } from '../../shared/openmodels';
import { api } from './api';

export function OpenModelsSetup({ onSaved }: { onSaved: () => void }) {
  const [view, setView] = useState<OpenModelsView | null>(null);
  const [baseUrl, setBaseUrl] = useState(''); const [key, setKey] = useState(''); const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]); const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void api.openModels().then((v) => { setView(v); if (v) { setBaseUrl(v.baseUrl); setModel(v.model); } }).catch(() => {}); }, []);
  const preset = OPEN_PRESETS.find((p) => p.baseUrl === baseUrl);
  const list = async () => { setErr(''); setNote(''); if (!cleanBaseUrl(baseUrl)) { setErr(t('open.badAddress')); return; } setBusy(true);
    try { const ids = await api.openModelsList(baseUrl, key); setModels(ids); if (!ids.length) setNote(t('open.noModels')); else { setNote(t('open.found', { count: ids.length })); if (!ids.includes(model)) setModel(ids[0]!); } }
    catch (e) { setErr((e as Error).message.replace(/^.*?Error: /, '')); } finally { setBusy(false); } };
  const save = async () => { setErr(''); setNote(''); if (!cleanBaseUrl(baseUrl)) { setErr(t('open.badAddress')); return; } if (!model.trim()) { setErr(t('open.needModel')); return; } setBusy(true);
    try { const v = await api.openModelsSave(baseUrl, model, key); setView(v); setKey(''); setNote(t('open.saved')); onSaved(); }
    catch (e) { setErr((e as Error).message.replace(/^.*?Error: /, '')); } finally { setBusy(false); } };
  const forgetKey = async () => { setBusy(true); try { const v = await api.openModelsSave(view?.baseUrl ?? baseUrl, view?.model ?? model, null); setView(v); setNote(t('open.keyForgotten')); onSaved(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return <section className="account open-models">
    <div className="account-head"><strong>{t('open.title')}</strong>{view?.baseUrl && view.model ? <span>{view.model}<em className="muted"> · {view.baseUrl}</em></span> : <span className="muted">{t('open.notSet')}</span>}</div>
    <p className="muted open-intro">{t('open.intro')}</p>
    <div className="open-grid">
      <label>{t('open.preset')}<select value={preset?.id ?? ''} onChange={(e) => { const p = OPEN_PRESETS.find((x) => x.id === e.target.value); if (p) { setBaseUrl(p.baseUrl); setModels([]); } }}>
        <option value="">{t('open.presetOther')}</option>{OPEN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label>{t('open.address')}<input value={baseUrl} spellCheck={false} placeholder="http://localhost:11434/v1" onChange={(e) => { setBaseUrl(e.target.value); setModels([]); }} /></label>
      <label>{t('open.key')}<input type="password" value={key} autoComplete="off" placeholder={view?.hasKey ? t('open.keyKept') : preset && !preset.needsKey ? t('open.keyNone') : ''} onChange={(e) => setKey(e.target.value)} /></label>
      <label>{t('open.model')}{models.length ? <select value={model} onChange={(e) => setModel(e.target.value)}>{models.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        : <input value={model} spellCheck={false} placeholder="qwen3-coder:30b" onChange={(e) => setModel(e.target.value)} />}</label>
    </div>
    <div className="account-actions">
      <button disabled={busy} onClick={() => void list()}>{t('open.list')}</button>
      <button disabled={busy} onClick={() => void save()}>{t('open.save')}</button>
      {view?.hasKey && <button disabled={busy} onClick={() => void forgetKey()}>{t('open.forgetKey')}</button>}
    </div>
    {err && <p className="warn open-msg">{err}</p>}{note && !err && <p className="muted open-msg">{note}</p>}
    <p className="muted open-hint">{t('open.localHint')}</p>
  </section>;
}
