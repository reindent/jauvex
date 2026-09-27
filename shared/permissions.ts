import type { CodexPermissionBaseline, Permissions, Provider, ProviderPermissions } from './types';
/** What a turn runs with: the provider's mode from the app's settings when one is set, else what the session's composer picked. */
export const effectivePermissions = (provider: Provider, picked: Permissions | undefined, modes?: ProviderPermissions): Permissions => modes?.[provider] ?? picked ?? 'ask';
/** Restore the provider's original controls on leaving YOLO, including a stricter user sandbox. */
export const codexPermissionOptions = (mode?: Permissions, baseline?: CodexPermissionBaseline) => ({
  approvalsReviewer: mode === 'auto' ? 'auto_review' : 'user',
  ...(mode === 'yolo' ? { approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' } } : baseline ?? {}),
});
export const grokPermissionOptions = (mode?: Permissions) => ({ autoMode: mode === 'auto', yoloMode: mode === 'yolo' });
