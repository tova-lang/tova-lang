/**
 * Security Scorecard — post-compilation security posture summary.
 */

export function generateSecurityScorecard(securityConfig, warnings, hasServer, hasEdge) {
  if (!hasServer && !hasEdge) return null;

  const items = [];
  let score = 10;

  const warningCodes = new Set((warnings || []).map(w => w.code).filter(Boolean));

  if (!securityConfig) {
    items.push({ pass: false, label: 'No security block configured', deduction: 3 });
    score -= 3;
    items.push({ pass: false, label: 'No auth configured', deduction: 2 });
    score -= 2;
    items.push({ pass: false, label: 'No CSRF protection', deduction: 1 });
    score -= 1;
    items.push({ pass: false, label: 'No rate limiting', deduction: 1 });
    score -= 1;
    items.push({ pass: false, label: 'No CSP configured', deduction: 1 });
    score -= 1;
    items.push({ pass: false, label: 'No audit logging', deduction: 1 });
    score -= 1;
    return { score: Math.max(0, score), items, format: () => formatScorecard(Math.max(0, score), items) };
  }

  // Auth
  if (securityConfig.auth) {
    const isCookie = securityConfig.auth.storage === 'cookie';
    const authType = securityConfig.auth.authType || 'JWT';
    if (isCookie) {
      items.push({ pass: true, label: `${authType} auth with HttpOnly cookies` });
    } else {
      items.push({ pass: true, label: `${authType} auth configured` });
    }
    if (warningCodes.has('W_LOCALSTORAGE_TOKEN')) {
      items.push({ pass: false, label: 'Auth tokens in localStorage (XSS vulnerable)', deduction: 1 });
      score -= 1;
    }
  } else {
    items.push({ pass: false, label: 'No auth configured', deduction: 2 });
    score -= 2;
  }

  // CSRF
  if (securityConfig.csrf && securityConfig.csrf.enabled === false) {
    items.push({ pass: false, label: 'CSRF protection disabled', deduction: 1 });
    score -= 1;
  } else if (securityConfig.auth) {
    items.push({ pass: true, label: 'CSRF enabled with session binding' });
  } else {
    items.push({ pass: false, label: 'No CSRF protection', deduction: 1 });
    score -= 1;
  }

  // Rate limiting
  if (securityConfig.rateLimit) {
    items.push({ pass: true, label: 'Rate limiting configured' });
  } else if (securityConfig.auth) {
    items.push({ pass: false, label: 'No rate limiting (auth without brute-force protection)', deduction: 1 });
    score -= 1;
  }

  // CSP
  if (securityConfig.csp) {
    items.push({ pass: true, label: 'Content Security Policy configured' });
  } else {
    items.push({ pass: false, label: 'No CSP configured', deduction: 1 });
    score -= 1;
  }

  // CORS wildcard
  if (warningCodes.has('W_CORS_WILDCARD')) {
    items.push({ pass: false, label: 'CORS allows wildcard origins', deduction: 1 });
    score -= 1;
  } else if (securityConfig.cors) {
    items.push({ pass: true, label: 'CORS restricted to specific origins' });
  }

  // Hardcoded secret
  if (warningCodes.has('W_HARDCODED_SECRET')) {
    items.push({ pass: false, label: 'Auth secret hardcoded in source', deduction: 1 });
    score -= 1;
  }

  // Audit logging
  if (securityConfig.audit) {
    items.push({ pass: true, label: 'Audit logging configured' });
  } else {
    items.push({ pass: false, label: 'No audit logging', deduction: 1 });
    score -= 1;
  }

  score = Math.max(0, score);
  return { score, items, format: () => formatScorecard(score, items) };
}

function formatScorecard(score, items) {
  const lines = [];
  lines.push(`\x1b[1mSecurity: ${score}/10\x1b[0m`);
  for (const item of items) {
    if (item.pass) {
      lines.push(`  \x1b[32m[pass]\x1b[0m ${item.label}`);
    } else {
      lines.push(`  \x1b[33m[warn]\x1b[0m ${item.label} (-${item.deduction})`);
    }
  }
  return lines.join('\n');
}
