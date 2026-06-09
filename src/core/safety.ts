const DENY_PATTERNS = [
  /\bsudo\b/i,
  /\brm\s+-[^\n;]*r[^\n;]*f/i,
  /\bchmod\s+-R\b/i,
  /\bchown\s+-R\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bcurl\b.*\|\s*(sh|bash)/i,
  /\bwget\b.*\|\s*(sh|bash)/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/sd/i,
  /\bmkfs\b/i,
  /\bdocker\s+run\b/i,
  /\bnpx\b/i,
  /\bcorepack\b/i,
  /\bpip\s+install\b/i,
  /\bscp\b/i,
  /\brsync\b/i,
  /\bssh\b/i,
  /\bbrew\s+install\b/i,
  /\bgit\s+clean\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+checkout\s+--\b/i,
  /\bgit\s+push\b.*\s--force\b/i,
  /(^|[^|])\|([^|]|$)/,
  /;/,
  /&&/,
  /\|\|/,
  /`/,
  /\$\(/,
  /\$[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*/i,
  />\s*\//,
  /\bnpm\s+(install|i|add|audit\s+fix)\b/i,
  /\bpnpm\s+(install|i|add|audit\s+fix)\b/i,
  /\byarn\s+(install|add|upgrade)\b/i
];

const ALLOW_PATTERNS = [
  /^git\s+(status|diff|show|rev-parse|branch|switch|checkout\s+-b|apply|ls-files|log)\b/i,
  /^node(\s|$)/i,
  /^npm\s+(run|run-script|test|--version|-v)\b/i,
  /^pnpm\s+(run|test|--version|-v)\b/i,
  /^yarn\s+(run|test|--version|-v)\b/i,
  /^python3?(\s|$)/i,
  /^rg(\s|$)/i,
  /^find\s+\.?(\s|$)/i,
  /^ls(\s|$)/i,
  /^cat\s+[^/]/i,
  /^sed\s+[^/]/i,
  /^test(\s|$)/i,
  /^true$/i,
  /^echo\s+[^>]/i
];

export interface SafetyResult {
  ok: boolean;
  reason?: string;
}

export function validateCommand(command: string): SafetyResult {
  const normalized = command.trim();
  if (!normalized) return { ok: false, reason: "Empty command." };
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(normalized)) {
      return { ok: false, reason: `Denied by safety pattern: ${pattern}` };
    }
  }
  const allowed = ALLOW_PATTERNS.some((pattern) => pattern.test(normalized));
  if (!allowed) {
    return {
      ok: false,
      reason:
        "Command is outside the Harness Lab allowlist. Use git inspection commands, local Node/Python commands, or npm/pnpm/yarn package scripts."
    };
  }
  return { ok: true };
}
