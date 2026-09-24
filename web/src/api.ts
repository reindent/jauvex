import type { ChatMessage, AgentRequestEvent, FileView, JauvexEntry, AgentCommand, AgentResult, Attachment, AccountEvent, AccountStatus, CommandDetails, SetupCheck, ProviderUsage, SessionPrefs, AppCommand, BusyTriage, DebugEvent, JevAgent, JevRun, AppState, ModelOption, Provider, UiState, Transcript, VoiceStatus, VoiceMirror, VoiceCommand, ChatEvent, ChatStart, MessagesPage, PermissionDecision, Project, SessionInfo } from '../../shared/types';

declare global { interface Window { desktop: { api(method: string, ...args: unknown[]): Promise<unknown>; pickFolder(): Promise<string | null>; pickImages(): Promise<Attachment[]>; chatStart(req: ChatStart): Promise<boolean>; chatStop(chatId: string): Promise<boolean>; chatSteer(chatId: string, text: string, images?: Attachment[]): Promise<boolean>; chatRunning(chatId: string): Promise<boolean>; chatLive(): Promise<{ chatId: string; projectId: string; sessionId: string | null }[]>; appReload(): Promise<boolean>; usage(provider: Provider, force?: boolean): Promise<ProviderUsage>; accountStatus(provider: Provider): Promise<AccountStatus>; accountLogout(provider: Provider): Promise<AccountStatus>; accountLogin(provider: Provider): Promise<boolean>; accountReply(provider: Provider, text: string): Promise<boolean>; accountCancel(provider: Provider): Promise<boolean>; onAccountEvent(cb: (e: AccountEvent) => void): () => void; onCommandDetails(cb: (d: CommandDetails) => void): () => void; readFile(path: string): Promise<FileView>; openPath(path: string): Promise<boolean>; onPaneOpen(cb: (url: string) => void): () => void; onAgentRequest(cb: (r: AgentRequestEvent) => void): () => void; agentRequestDone(id: string, text: string): void; onAppCommand(cb: (c: { id: string; command: AgentCommand }) => void): () => void; appCommandDone(id: string, result: AgentResult): void; openExternal(url: string): Promise<boolean>; appRestart(): Promise<boolean>; appReset(): Promise<boolean>; chatAnswer(chatId: string, requestId: string, decision: PermissionDecision): Promise<boolean>; onChatEvent(cb: (ev: ChatEvent) => void): () => void; voiceOn(on: boolean, who: string, provider?: Provider, ackModel?: string, stt?: { model: string; vocabulary: string }): Promise<VoiceStatus>; sttConfig(model: string, vocabulary: string): Promise<boolean>; debugList(): Promise<DebugEvent[]>; debugClear(): Promise<boolean>; welcomeAudio(open: boolean): void; miniDrag(on: boolean): void; welcomeIntent(text: string): Promise<{ start: boolean; provider: Provider | null }>; debugPush(kind: DebugEvent['kind'], text: string): void; onDebug(cb: (e: DebugEvent) => void): () => void; decisions(useJev: boolean): Promise<VoiceStatus>; command(text: string, projects: { id: string; name: string; path?: string }[], currentId: string, speaker?: { provider: Provider; model: string; main: string; mainModel?: string }): Promise<AppCommand | null>; thoughtDone(text: string): Promise<{ done: boolean; p: number; by: 'jev' | 'none' }>; voiceStatus(): Promise<VoiceStatus>; voiceModelInUse(provider: Provider, preferred: string): Promise<string>; setupCheck(): Promise<SetupCheck>; wakeCheck(wav: ArrayBuffer, phrase: string, language: string): Promise<{ woke: boolean; heard: string }>; transcribe(wav: ArrayBuffer, language: string, quiet?: boolean, hint?: string, retry?: boolean): Promise<Transcript>; ack(text: string): Promise<string>; understand(text: string, provider: Provider, model: string, main: string, recent?: string, said?: string): Promise<string>; triage(text: string, provider: Provider, model: string, main: string, task?: string): Promise<BusyTriage>; summarize(asked: string, answer: string, provider: Provider, model: string, main: string): Promise<string>; speak(text: string, voice: string, rate: number): Promise<ArrayBuffer | null>; cancelSpeech(): Promise<boolean>; voiceState(st: VoiceMirror): void; onVoiceState(cb: (st: VoiceMirror) => void): () => void; voiceCmd(cmd: VoiceCommand): void; voiceType(text: string): void; onVoiceType(cb: (text: string) => void): () => void; miniSize(w: number): void; onVoiceCmd(cb: (cmd: VoiceCommand) => void): () => void; platform: string } } }

// Electron IPC wraps thrown errors as "Error invoking remote method 'api': Error: <message>".
async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  try { return (await window.desktop.api(method, ...args)) as T; }
  catch (e) { throw new Error(String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
}
export const api = {
  state: () => call<AppState>('state'),
  setUi: (ui: UiState) => call<boolean>('setUi', ui),
  addProject: (path: string) => call<Project>('addProject', path),
  jauvexProject: () => call<Project>('jauvexProject'),
  sessionExists: (id: string, sessionId: string) => call<boolean>('sessionExists', id, sessionId),
  notes: (sessionId: string) => call<{ after: string; message: ChatMessage }[]>('notes', sessionId),
  noteAppend: (sessionId: string, entries: { after: string; message: ChatMessage }[]) => call<boolean>('noteAppend', sessionId, entries),
  jauvexTranscript: () => call<JauvexEntry[]>('jauvexTranscript'),
  jauvexAppend: (entry: JauvexEntry) => call<boolean>('jauvexAppend', entry),
  jauvexHandover: (note: string, from: string, to: string) => call<boolean>('jauvexHandover', note, from, to),
  removeProject: (id: string) => call<boolean>('removeProject', id),
  sessions: (id: string) => call<SessionInfo[]>('sessions', id),
  setSessions: (id: string, sessionIds: string[], providers: Record<string, Provider>) => call<Project>('setSessions', id, sessionIds, providers),
  messages: (id: string, sid: string, before?: number) => call<MessagesPage>('messages', id, sid, before),
  setPrefs: (id: string, sid: string, prefs: SessionPrefs) => call<boolean>('setPrefs', id, sid, prefs),
  jevAvailable: () => call<boolean>('jevAvailable'),
  jevCreate: (id: string) => call<JevAgent>('jevCreate', id),
  jevSave: (id: string, agentId: string, patch: Partial<Pick<JevAgent, 'name' | 'state' | 'questions' | 'llm' | 'sessionId'>>) => call<JevAgent>('jevSave', id, agentId, patch),
  jevDelete: (id: string, agentId: string) => call<boolean>('jevDelete', id, agentId),
  jevEvaluate: (id: string, agentId: string, state: string, questions: string) => call<JevRun>('jevEvaluate', id, agentId, state, questions),
  rename: (id: string, sid: string, title: string) => call<boolean>('rename', id, sid, title),
  models: (provider: Provider) => call<ModelOption[]>('models', provider),
};
export const pickFolder = () => window.desktop.pickFolder();
export function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`; return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export const size = (b?: number) => b == null ? '' : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
