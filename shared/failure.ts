// A provider's own failure, when it arrives as if it were an answer (T-31: an organisation that disabled subscription access, an allowance
// run out, a network error): a red card in the thread and one spoken line, never a summary. Claude's are marked by its SDK (`error` on the
// message, chat.ts); this is for any that comes unmarked: the provider's text starts the answer. The rule once took any answer under 700
// characters with a number from 500 to 599 ("4,500 characters", "4,532,147 bytes") or a word such as "rate limit" or "authentication" in
// it for a failure (T-270, 2026-10-01): an agent's stand-up summary showed as "The provider could not answer", unspoken.
const START = /^(?:api error\b|error: (?:\d{3}\b|request|connection|rate|unauthori[sz]ed|forbidden)|credit balance is too low|claude ai usage limit reached|you(?:'|’)?ve hit your (?:usage )?limit|you have hit your (?:usage )?limit|\d+-hour limit reached|usage limit reached|rate limit (?:exceeded|reached)|invalid api key|(?:your )?organi[sz]ation has disabled|oauth token has expired|insufficient credits|out of credits)/i;
export const failureText = (t: string): boolean => { const s = t.trim(); return s.length > 0 && s.length <= 600 && !s.includes('```') && START.test(s); };
