// Feedback from inside the app (Diego, 2026-10-04): a bug report, feature request or idea, sent to Reindent through jauvex.reindent.com
// (POST /api/feedback; the site's feedback.py checks every field). Pure: what the person typed, checked as the site checks it, and the
// log they agreed to attach, cleaned of anything secret first. Never a workspace's files, chats or keys.
export const FEEDBACK_TYPES = ['bug', 'feature', 'idea', 'feedback', 'question'] as const; // Diego, 2026-10-04: Idea, Feedback, Bug, Question
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackForm = { type: FeedbackType; title: string; description: string; contact: string; screenshot: boolean; log: boolean };
export const SHOT_FILE = 'feedback-screenshot.png'; // in the data folder: the screenshot the person was shown, the one sent
export const LOG_LINES = 300;

/** What is wrong with the form, as the site would say it, or null. */
export function formProblem(f: FeedbackForm): 'title' | 'description' | 'contact' | null {
  const title = f.title.trim();
  if (title.length < 3 || title.length > 140 || /[\x00-\x1f\x7f]/.test(title)) return 'title';
  const d = f.description.trim(); if (!d || d.length > 8000) return 'description';
  if (f.contact.trim() && !/^[^@\s<>"]{1,64}@[^@\s<>"]{1,190}\.[A-Za-z]{2,24}$/.test(f.contact.trim())) return 'contact';
  return null;
}

/** The log as it is sent: its last lines, with keys, tokens, passwords, emails and the home folder taken out. */
export function cleanLog(text: string, home: string, lines = LOG_LINES): string {
  let out = text.split('\n').slice(-lines).join('\n');
  if (home) out = out.split(home).join('~');
  return out
    .replace(/\b(sk|pk|rk|xai|ghp|gho|github_pat|glpat|AKIA|ASIA)[-_][A-Za-z0-9_-]{8,}/g, '[secret]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [secret]')
    .replace(/\b(key|token|secret|password|passwd|pwd|apikey|api_key|authorization|cookie)(["']?\s*[:=]\s*["']?)[^\s"',;&]{4,}/gi, '$1$2[secret]')
    .replace(/([?&](?:key|token|sig|signature)=)[^&\s]+/gi, '$1[secret]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[long-id]');
}
