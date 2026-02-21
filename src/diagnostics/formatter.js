// Rich error message formatter for the Tova language
// Produces Rust/Elm-style error messages with source context, carets, and fix suggestions

import { parseIgnoreComment } from './error-codes.js';

// ─── ANSI color helpers (terminal only) ──────────────────────

const _isTTY = typeof process !== 'undefined' && process.stderr && process.stderr.isTTY;

const _c = {
  red:     (s) => _isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow:  (s) => _isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  cyan:    (s) => _isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  green:   (s) => _isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  blue:    (s) => _isTTY ? `\x1b[34m${s}\x1b[0m` : s,
  dim:     (s) => _isTTY ? `\x1b[2m${s}\x1b[0m` : s,
  bold:    (s) => _isTTY ? `\x1b[1m${s}\x1b[0m` : s,
};

// ─── DiagnosticFormatter ─────────────────────────────────────

export class DiagnosticFormatter {
  constructor(source, filename = '<stdin>') {
    this.source = source;
    this.filename = filename;
    this.lines = source.split('\n');
  }

  /**
   * Format a diagnostic with full source context.
   * @param {string} level     - 'error' | 'warning' | 'info' | 'hint'
   * @param {string} message   - Human-readable message
   * @param {object} loc       - { line, column }
   * @param {object} [opts]    - { hint, code, length, fix }
   *   hint:   string — suggestion text
   *   code:   string — error code like 'E100'
   *   length: number — underline length (default 1)
   *   fix:    { description, replacement } — auto-fix suggestion
   */
  format(level, message, loc, opts = {}) {
    // Backwards compat: opts can be a string (hint)
    if (typeof opts === 'string') opts = { hint: opts };

    const hint   = opts.hint || null;
    const code   = opts.code || null;
    const length = opts.length || 0;
    const fix    = opts.fix || null;

    const line   = loc.line || 1;
    const column = loc.column || 1;
    const lineNum = Math.max(1, Math.min(line, this.lines.length));
    const gutterWidth = Math.max(String(lineNum + 1).length, 3);

    let output = '';

    // ── Header ──
    const levelStr = level === 'error' ? _c.red(_c.bold('error'))
                   : level === 'warning' ? _c.yellow(_c.bold('warning'))
                   : _c.blue(_c.bold(level));
    const codeStr = code ? _c.dim(`[${code}]`) + ' ' : '';
    output += `${levelStr}: ${codeStr}${_c.bold(message)}\n`;
    output += `${' '.repeat(gutterWidth)}${_c.blue(' -->')} ${this.filename}:${lineNum}:${column}\n`;

    // ── Context lines ──
    const startLine = Math.max(1, lineNum - 2);
    const endLine = Math.min(this.lines.length, lineNum + 1);

    output += `${' '.repeat(gutterWidth)} ${_c.blue('|')}\n`;

    for (let i = startLine; i <= endLine; i++) {
      const lineContent = this.lines[i - 1] || '';
      const lineStr = String(i).padStart(gutterWidth);

      if (i === lineNum) {
        // The error line
        output += `${_c.blue(lineStr)} ${_c.blue('|')} ${lineContent}\n`;
        // Underline with carets
        const caretPad = ' '.repeat(Math.max(0, column - 1));
        const underlineLen = Math.max(1, length || _guessLength(lineContent, column));
        const underline = '^'.repeat(underlineLen);
        const caretColor = level === 'error' ? _c.red : _c.yellow;
        output += `${' '.repeat(gutterWidth)} ${_c.blue('|')} ${caretPad}${caretColor(underline)}\n`;
      } else {
        output += `${_c.dim(lineStr)} ${_c.blue('|')} ${lineContent}\n`;
      }
    }

    output += `${' '.repeat(gutterWidth)} ${_c.blue('|')}\n`;

    // ── Hint ──
    if (hint) {
      output += `${' '.repeat(gutterWidth)} ${_c.blue('=')} ${_c.cyan('hint')}: ${hint}\n`;
    }

    // ── Fix suggestion ──
    if (fix) {
      output += `${' '.repeat(gutterWidth)} ${_c.blue('=')} ${_c.green('fix')}: ${fix.description}\n`;
      if (fix.replacement !== undefined) {
        output += `${' '.repeat(gutterWidth)}   ${_c.green('|')} ${_c.green(fix.replacement)}\n`;
      }
    }

    return output;
  }

  formatError(message, loc, hintOrOpts = null) {
    const opts = typeof hintOrOpts === 'string' ? { hint: hintOrOpts } : (hintOrOpts || {});
    return this.format('error', message, loc, opts);
  }

  formatWarning(message, loc, hintOrOpts = null) {
    const opts = typeof hintOrOpts === 'string' ? { hint: hintOrOpts } : (hintOrOpts || {});
    return this.format('warning', message, loc, opts);
  }
}

// Guess a reasonable underline length from the token at the given column
function _guessLength(lineContent, column) {
  const rest = lineContent.slice(column - 1);
  // Try to find a word boundary
  const wordMatch = rest.match(/^(\w+|[^\s]+)/);
  if (wordMatch) return wordMatch[1].length;
  return 1;
}

// ─── Format arrays of diagnostics ────────────────────────────

export function formatDiagnostics(source, filename, errors, warnings = []) {
  const formatter = new DiagnosticFormatter(source, filename);
  const ignoredCodes = _collectIgnoredCodes(source);
  let output = '';

  for (const err of errors) {
    if (err.code && ignoredCodes.has(err.code)) continue;
    output += formatter.formatError(
      err.message,
      { line: err.line, column: err.column },
      { hint: err.hint, code: err.code, length: err.length, fix: err.fix }
    );
    output += '\n';
  }

  for (const warn of warnings) {
    if (warn.code && ignoredCodes.has(warn.code)) continue;
    output += formatter.formatWarning(
      warn.message,
      { line: warn.line, column: warn.column },
      { hint: warn.hint, code: warn.code, length: warn.length, fix: warn.fix }
    );
    output += '\n';
  }

  return output;
}

// Collect all tova-ignore codes from source comments
function _collectIgnoredCodes(source) {
  const codes = new Set();
  for (const line of source.split('\n')) {
    const parsed = parseIgnoreComment(line);
    if (parsed) {
      for (const c of parsed) codes.add(c);
    }
  }
  return codes;
}

// ─── Helper: extract location from typical Tova error messages ──

export function parseErrorLocation(errorMessage) {
  const match = errorMessage.match(/^(.+?):(\d+):(\d+)\s*[—-]\s*(.+)/);
  if (match) {
    return {
      file: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      message: match[4],
    };
  }
  return null;
}

// ─── Create a rich error from a Tova parse/analysis error ────

export function richError(source, error, filename = '<stdin>') {
  const formatter = new DiagnosticFormatter(source, filename);

  // If error carries structured errors, format them all
  if (error.errors && Array.isArray(error.errors)) {
    let output = '';
    for (const e of error.errors) {
      if (e.line && e.column) {
        output += formatter.formatError(
          e.message,
          { line: e.line, column: e.column },
          { hint: e.hint, code: e.code, length: e.length, fix: e.fix }
        );
        output += '\n';
      } else if (e.loc) {
        output += formatter.formatError(
          e.message.replace(/^.+?:\d+:\d+\s*[—-]\s*/, ''),
          { line: e.loc.line, column: e.loc.column },
          { hint: e.hint, code: e.code }
        );
        output += '\n';
      } else {
        // Try to parse location from message
        const loc = parseErrorLocation(e.message);
        if (loc) {
          output += formatter.formatError(loc.message, { line: loc.line, column: loc.column });
          output += '\n';
        } else {
          output += formatter.formatError(e.message, { line: 1, column: 1 });
          output += '\n';
        }
      }
    }
    return output || error.message;
  }

  // Try to extract location from error message
  const loc = parseErrorLocation(error.message);
  if (loc) {
    let hint = null;
    if (loc.message.includes("Expected '}'")) {
      hint = "check for a matching opening '{' above";
    } else if (loc.message.includes("Expected ')'")) {
      hint = "check for a matching opening '(' above";
    } else if (loc.message.includes("Expected ']'")) {
      hint = "check for a matching opening '[' above";
    }

    return formatter.formatError(loc.message, { line: loc.line, column: loc.column }, { hint });
  }

  // Fallback: try to parse the error for analysis errors
  if (error.message.startsWith('Analysis errors:')) {
    const lines = error.message.split('\n').slice(1);
    let output = '';
    for (const line of lines) {
      const errLoc = parseErrorLocation(line.trim());
      if (errLoc) {
        output += formatter.formatError(errLoc.message, { line: errLoc.line, column: errLoc.column });
        output += '\n';
      }
    }
    return output || error.message;
  }

  return error.message;
}

// ─── Summary line for CLI output ─────────────────────────────

export function formatSummary(errorCount, warningCount) {
  const parts = [];
  if (errorCount > 0) parts.push(_c.red(`${errorCount} error${errorCount === 1 ? '' : 's'}`));
  if (warningCount > 0) parts.push(_c.yellow(`${warningCount} warning${warningCount === 1 ? '' : 's'}`));
  if (parts.length === 0) return _c.green('no errors');
  return parts.join(', ') + ' emitted';
}
