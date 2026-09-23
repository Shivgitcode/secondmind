/**
 * Strip things that look like credentials before they are stored or sent to a
 * model. Transcripts routinely contain pasted keys and .env files, and a note
 * is meant to outlive the session it came from — the secret should not.
 *
 * This is pattern matching, not a guarantee. It catches the common shapes.
 */
const PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted private key]'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, '[redacted anthropic key]'],
  [/\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{20,}/g, '[redacted api key]'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, '[redacted github token]'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, '[redacted github token]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '[redacted slack token]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted aws key]'],
  [/\bAIza[A-Za-z0-9_-]{35}\b/g, '[redacted google key]'],
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g, '[redacted stripe key]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted jwt]'],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}=*/gi, '$1[redacted]'],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, '$1[redacted]@'],
  [/\b((?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, '$1[redacted]'],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
