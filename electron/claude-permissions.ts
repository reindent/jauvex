import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { Permissions } from '../shared/types.js';

/** Explicit app selection: no hidden overrides from a repository's settings. */
export function claudePermissionOptions(requested?: Permissions): Pick<Options, 'permissionMode' | 'allowDangerouslySkipPermissions'> {
  if (requested === 'yolo') return { permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true };
  return { permissionMode: requested === 'auto' ? 'auto' : 'default' };
}
