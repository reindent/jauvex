// The window's last line of defence (from the other edition's fix of a window left blank three times in a day): React takes the whole page down
// when a component throws while drawing, and the window was left its background colour, white on a light look, nothing in it and no word
// anywhere. Here the error goes to the flight recorder with where it happened, the window says so in its own words, and it loads itself again
// a moment later (running turns carry on, as after any reload). Thrown again and again right after reloading, it stops reloading by itself and
// leaves the user the button: a loop is not a recovery.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../../shared/i18n';

const KEY = 'cvc.page-errors'; // when this window's page last reloaded for an error (sessionStorage: it survives a reload, not a restart)
const RELOAD_MS = 1500, LOOP_MS = 120_000, LOOP_MAX = 2;
type S = { error: Error | null; stuck: boolean };

export class Fallback extends Component<{ children: ReactNode }, S> {
  state: S = { error: null, stuck: false };
  static getDerivedStateFromError(error: Error): Partial<S> { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    const where = (info.componentStack ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4).join(' < ');
    const push = (text: string) => { try { window.desktop?.debugPush('note', text); } catch { /* no bridge: nothing to tell */ } };
    push(`the window's page hit an error while drawing: ${error.message} (${where || 'no component stack'})`);
    let recent: number[] = []; try { recent = (JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as number[]).filter((x) => Date.now() - x < LOOP_MS); } catch { /* none kept */ }
    if (recent.length >= LOOP_MAX) { push(`the window's page hit an error ${recent.length + 1} times in two minutes: it is not loaded again by itself; the Reload button is there`); this.setState({ stuck: true }); return; }
    recent.push(Date.now()); try { sessionStorage.setItem(KEY, JSON.stringify(recent)); } catch { /* none kept */ }
    window.setTimeout(() => { void window.desktop?.appReload(); }, RELOAD_MS);
  }
  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <div className="page-fallback" role="alert"><h2>{t('window.errorTitle')}</h2><p>{t('window.errorBody', { error: this.state.error.message })}</p>
      <button type="button" onClick={() => { void window.desktop?.appReload(); }}>{t('window.reload')}</button>{this.state.stuck && <p className="page-fallback-stuck">{t('window.errorAgain')}</p>}</div>;
  }
}
