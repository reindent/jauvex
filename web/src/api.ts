import type { ChatMessage, AgentRequestEvent, FileView, JauvexEntry, AgentCommand, AgentResult, Attachment, AccountEvent, AccountStatus, CommandDetails, SetupCheck, ProviderUsage, SessionPrefs, AppCommand, BusyTriage, DebugEvent, JevAgent, JevRun, AppState, ModelOption, Provider, UiState, Transcript, VoiceStatus, VoiceMirror, VoiceCommand, ChatEvent, ChatStart, MessagesPage, PermissionDecision, Project, SessionInfo } from '../../shared/types';
import type { UpdateStatus } from '../../shared/update';
import type { BoardInfo } from '../../shared/board';
import type { WorkflowInfo, Run } from '../../shared/workflow';

declare global { interface Window { desktop: { api(method: string, ...args: unknown[]): Promise<unknown>; pickFolder(): Promise<string | null>; pickImages(): Promise<Attachment[]>; chatStart(req: ChatStart): Promise<boolean>; chatStop(chatId: string): Promise<boolean>; chatSteer(chatId: string, text: string, images?: Attachment[]): Promise<boolean>; chatRunning(chatId: string): Promise<boolean>; chatLive(): Promise<{ chatId: string; projectId: string; sessionId: string | null }[]>; appReload(): Promise<boolean>; usage(provider: Provider, force?: boolean): Promise<ProviderUsage>; accountStatus(provider: Provider): Promise<AccountStatus>; accountLogout(provider: Provider): Promise<AccountStatus>; accountLogin(provider: Provider): Promise<boolean>; accountReply(provider: Provider, text: string): Promise<boolean>; accountCancel(provider: Provider): Promise<boolean>; onAccountEvent(cb: (e: AccountEvent) => void): () => void; onCommandDetails(cb: (d: CommandDetails) => void): () => void; readFile(path: string): Promise<FileView>; openPath(path: string): Promise<boolean>; onPaneOpen(cb: (url: string) => void): () => void; onAgentRequest(cb: (r: AgentRequestEvent) => void): () => void; agentRequestDone(id: string, text: string): void; onAppCommand(cb: (c: { id: string; command: AgentCommand }) => void): () => void; appCommandDone(id: string, result: AgentResult): void; openExternal(url: string): Promise<boolean>; appRestart(): Promise<boolean>; appUpdateStatus(): Promise<UpdateStatus>; appUpdate(): Promise<AgentResult>; onAppUpdate(cb: (s: UpdateStatus) => void): () => void; appReset(): Promise<boolean>; chatAnswer(chatId: string, requestId: string, decision: PermissionDecision): Promise<boolean>; onChatEvent(cb: (ev: ChatEvent) => void): () => void; voiceOn(on: boolean, who: string, provider?: Provider, ackModel?: string, stt?: { model: string; vocabulary: string }): Promise<VoiceStatus>; sttConfig(model: string, vocabulary: string): Promise<boolean>; debugList(): Promise<DebugEvent[]>; debugClear(): Promise<boolean>; welcomeAudio(open: boolean): void; miniDrag(on: boolean): void; welcomeIntent(text: string): Promise<{ start: boolean; provider: Provider | null }>; debugPush(kind: DebugEvent['kind'], text: string): void; onDebug(cb: (e: DebugEvent) => void): () => void; decisions(useJev: boolean): Promise<VoiceStatus>; command(text: string, projects: { id: string; name: string; path?: string }[], currentId: string, speaker?: { provider: Provider; model: string; main: string; mainModel?: string }): Promise<AppCommand | null>; thoughtDone(text: string): Promise<{ done: boolean; p: number; by: 'jev' | 'none' }>; voiceStatus(): Promise<VoiceStatus>; voiceModelInUse(provider: Provider, preferred: string): Promise<string>; setupCheck(): Promise<SetupCheck>; wakeCheck(wav: ArrayBuffer, phrase: string, language: string): Promise<{ woke: boolean; heard: string }>; transcribe(wav: ArrayBuffer, language: string, quiet?: boolean, hint?: string, retry?: boolean): Promise<Transcript>; ack(text: string): Promise<string>; understand(text: string, provider: Provider, model: string, main: string, recent?: string, said?: string): Promise<string>; triage(text: string, provider: Provider, model: string, main: string, task?: string): Promise<BusyTriage>; summarize(asked: string, answer: string, provider: Provider, model: string, main: string): Promise<string>; speak(text: string, voice: string, rate: number): Promise<ArrayBuffer | null>; cancelSpeech(): Promise<boolean>; voiceState(st: VoiceMirror): void; onVoiceState(cb: (st: VoiceMirror) => void): () => void; voiceCmd(cmd: VoiceCommand): void; voiceType(text: string): void; onVoiceType(cb: (text: string) => void): () => void; miniSize(w: number): void; onVoiceCmd(cb: (cmd: VoiceCommand) => void): () => void; platform: string } } }

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
  changelog: () => call<string>('changelog'), // the app's own CHANGELOG.md (T-218)
  // workflows: a file per workflow and a folder beside it (its steps' instructions, runs, versions, chat)
  workflows: (id: string) => call<WorkflowInfo[]>('workflows', id),
  workflow: (id: string, file: string) => call<{ md: string; runs: Run[]; prompts?: Record<string, string> }>('workflow', id, file), // prompts: the steps' files
  saveWorkflow: (id: string, file: string, md: string) => call<boolean>('saveWorkflow', id, file, md),
  saveWorkflowStep: (id: string, file: string, step: string, text: string) => call<boolean>('saveWorkflowStep', id, file, step, text),
  removeWorkflowStep: (id: string, file: string, step: string) => call<boolean>('removeWorkflowStep', id, file, step),
  workflowVersions: (id: string, file: string) => call<{ versions: { n: number; taken: string }[]; current: number | null }>('workflowVersions', id, file),
  restoreWorkflowVersion: (id: string, file: string, v: number) => call<{ restored: number; kept: number | null }>('restoreWorkflowVersion', id, file, v),
  workflowVersion: (id: string, file: string, v: number) => call<string>('workflowVersion', id, file, v),
  newWorkflow: (id: string, name: string, agent?: string) => call<string>('newWorkflow', id, name, agent),
  workflowChat: (id: string, file: string) => call<{ provider?: Provider; sessionId?: string | null }>('workflowChat', id, file),
  setWorkflowChat: (id: string, file: string, c: { provider?: Provider; sessionId?: string | null }) => call<boolean>('setWorkflowChat', id, file, c),
  run: (id: string, file: string) => call<string>('run', id, file),
  newRun: (id: string, file: string) => call<{ n: number; file: string; folder: string; version?: number }>('newRun', id, file),
  saveRun: (id: string, file: string, md: string) => call<boolean>('saveRun', id, file, md),
  deleteWorkflow: (id: string, file: string) => call<void>('deleteWorkflow', id, file),
  moveWorkflow: (id: string, file: string, to: string) => call<{ file: string; chat: { provider?: string; sessionId: string } | null }>('moveWorkflow', id, file, to), // T-217: with its chat's session
  moveSession: (id: string, sessionId: string, to: string) => call<{ provider: Provider }>('moveSession', id, sessionId, to),
  // boards: markdown to-do lists in the project folder
  boards: (id: string) => call<BoardInfo[]>('boards', id),
  board: (id: string, file: string) => call<{ md: string; done: string }>('board', id, file),
  boardSet: (id: string, file: string, line: number, status: 'todo' | 'doing' | 'done', where: 'board' | 'done' = 'board', task = '') => call<{ md: string; done: string }>('boardSet', id, file, line, status, where, task),
  newBoard: (id: string, name: string) => call<string>('newBoard', id, name),
  deleteBoard: (id: string, file: string) => call<void>('deleteBoard', id, file),
  boardChat: (id: string, file: string) => call<{ provider?: Provider; sessionId?: string | null }>('boardChat', id, file), // a board's own chat (T-199)
  setBoardChat: (id: string, file: string, c: { provider?: Provider; sessionId?: string | null }) => call<boolean>('setBoardChat', id, file, c),
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
