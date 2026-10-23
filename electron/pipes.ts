// Connections and pipes whose other end has gone (from the other edition's fix: "A JavaScript error occurred in the main process ... write
// EPIPE ... at Socket.end"): a stream with no 'error' listener turns that into an uncaught exception, and Electron shows it as a fatal dialog
// over the whole app. Every child process the app writes to listens for its errors; what still slips through is caught last in main.ts
// (pipeError) and written to the flight recorder instead of a dialog.
import type { ChildProcess } from 'node:child_process';

/** The errors of a connection or a pipe whose other end closed: the end of that one stream, never a reason to stop the app. */
const PIPE_ERRORS = new Set(['EPIPE', 'ECONNRESET', 'ECONNABORTED', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END']);
export const pipeError = (e: unknown): boolean => PIPE_ERRORS.has(String((e as NodeJS.ErrnoException | null)?.code ?? ''));

/** A child process whose pipes may fail without taking the app down: its exit (or its 'error') says what happened. */
export function guardPipes<T extends ChildProcess>(child: T): T {
  for (const s of [child.stdin, child.stdout, child.stderr]) s?.on('error', () => { /* the process is gone: its exit says so */ });
  return child;
}
