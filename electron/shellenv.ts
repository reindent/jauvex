// The login shell's variables the app needs, read from one printf per variable (pure, checked in tests/claude-config-dir.test.ts).
export const SHELL_VARS = ['PATH', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'] as const;
export type ShellVar = (typeof SHELL_VARS)[number];
export function parseShellVars(out: string): Partial<Record<ShellVar, string>> {
  const got: Partial<Record<ShellVar, string>> = {};
  for (const k of SHELL_VARS) { const m = new RegExp(`__${k}__([\\s\\S]*?)__END_${k}__`).exec(out); const v = m?.[1]?.trim(); if (v) got[k] = v; }
  return got;
}
