// Permission modes (Ask, Auto, YOLO) as each provider takes them, and the app's per-provider setting over a session's own pick.
const { claudePermissionOptions } = await import('../electron/claude-permissions.ts');
const { codexPermissionOptions, effectivePermissions, grokPermissionOptions } = await import('../shared/permissions.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !got ? '' : `: ${got}`}`); if (!ok) failed++; };
const readOnly = { approvalPolicy: 'untrusted', sandboxPolicy: { type: 'readOnly' } };
for (const mode of ['ask', 'auto', 'yolo'] as const) {
  const claude = claudePermissionOptions(mode), codex = codexPermissionOptions(mode, readOnly), grok = grokPermissionOptions(mode);
  check(`${mode}: Claude's mode`, claude.permissionMode === (mode === 'yolo' ? 'bypassPermissions' : mode === 'auto' ? 'auto' : 'default') && (claude.allowDangerouslySkipPermissions === true) === (mode === 'yolo'), JSON.stringify(claude));
  check(`${mode}: Codex's approvals and sandbox (the user's own read-only config outside YOLO)`, codex.approvalPolicy === (mode === 'yolo' ? 'never' : 'untrusted') && (codex.sandboxPolicy as { type: string }).type === (mode === 'yolo' ? 'dangerFullAccess' : 'readOnly') && codex.approvalsReviewer === (mode === 'auto' ? 'auto_review' : 'user'), JSON.stringify(codex));
  check(`${mode}: Grok's modes, both said every time`, grok.yoloMode === (mode === 'yolo') && grok.autoMode === (mode === 'auto'), JSON.stringify(grok));
}
check('Codex outside YOLO with nothing to restore sends no sandbox: its own config stands', codexPermissionOptions('ask').sandboxPolicy === undefined);
check('the provider setting wins over the session\'s pick', effectivePermissions('claude', 'auto', { claude: 'yolo' }) === 'yolo' && effectivePermissions('claude', 'yolo', { claude: 'ask' }) === 'ask');
check('...for its own provider only', effectivePermissions('codex', 'ask', { claude: 'yolo' }) === 'ask');
check('no pick and no setting: Ask', effectivePermissions('grok', undefined, {}) === 'ask');
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
