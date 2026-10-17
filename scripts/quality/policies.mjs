import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';

export function forbiddenPath(file) {
  if (/(?:^|\/)\.env(?:\.|$)/.test(file) && !/\.env\.(?:example|sample)$/.test(file))
    return 'private environment file';
  if (/(?:^|\/)(?:\.secrets|\.devnet)(?:\/|$)/.test(file) || /\.(?:key|p12|pfx|pem)$/i.test(file))
    return 'private key or node state';
  if (/^products\/streak\/data\//.test(file)) return 'application runtime data';
  return undefined;
}

export function secretFindings(content) {
  const rules = [
    ['private key PEM', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['GitHub access token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ['Telegram bot token', /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/],
    [
      'literal signing key',
      /(?:private_?key|secret_?key)\s*["']?\s*[:=]\s*["'](?:0x)?[a-f\d]{64}["']/i,
    ],
    [
      'credentialed remote database URL',
      /postgres(?:ql)?:\/\/[^\s:/<>]+:[^\s@<>]+@(?!localhost(?=[:/])|127\.0\.0\.1(?=[:/])|\[::1\](?=[:/]))[^\s"'<>]+/i,
    ],
  ];
  return rules.filter(([, pattern]) => pattern.test(content)).map(([name]) => name);
}

export function browserFindings(content) {
  const rules = [
    [
      'server module imported into browser',
      /(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*(?:\/src\/(?:store(?:_pg)?|wallet|server|auth|env|config)|(?:^|\/)server\/)[^"']*["']/m,
    ],
    [
      'Node/database dependency imported into browser',
      /(?:from\s*|import\s*\(|require\s*\()\s*["'](?:node:|pg["']|(?:fs|net|tls|child_process)["'])/,
    ],
    [
      'server credential referenced in browser',
      /\b(?:process\.env\.(?:DATABASE_URL|SUPABASE_KEY|API_SPORTS_KEY|TELEGRAM_BOT_TOKEN)|import\.meta\.env\.(?:VITE_)?(?:PRIVATE_KEY|DATABASE_URL|SUPABASE_KEY))\b/,
    ],
  ];
  return rules.filter(([, pattern]) => pattern.test(content)).map(([name]) => name);
}

export function anchors(content) {
  const result = new Set();
  const clean = content.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '');
  for (const match of clean.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\-\s]/gu, '')
      .replace(/\s/g, '-');
    let slug = base,
      count = 0;
    while (result.has(slug)) slug = `${base}-${++count}`;
    result.add(slug);
  }
  for (const match of content.matchAll(/<(?:a|h[1-6])\b[^>]*(?:id|name)=["']([^"']+)["']/gi))
    result.add(match[1]);
  return result;
}

export function documentationFailures(root, file, content) {
  const failures = [];
  const clean = content
    .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
  const links = [
    ...[...clean.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g)].map(
      (m) => m[1],
    ),
    ...[...clean.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)].map((m) => m[1]),
  ];
  for (const raw of links) {
    const href = raw.replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    let target, anchor;
    try {
      const [rawPath, rawAnchor] = href.split('#', 2);
      target = rawPath
        ? resolve(dirname(resolve(root, file)), decodeURIComponent(rawPath.split('?')[0]))
        : resolve(root, file);
      anchor = rawAnchor ? decodeURIComponent(rawAnchor) : undefined;
    } catch {
      failures.push('invalid encoded local link');
      continue;
    }
    const rel = relative(root, target);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      failures.push('local link leaves repository');
      continue;
    }
    if (!existsSync(target)) {
      failures.push(`missing local link target: ${href}`);
      continue;
    }
    if (
      anchor &&
      statSync(target).isFile() &&
      /\.mdx?$/i.test(target) &&
      !anchors(readFileSync(target, 'utf8')).has(anchor)
    ) {
      failures.push(`missing heading: ${href}`);
    }
  }
  return failures;
}
