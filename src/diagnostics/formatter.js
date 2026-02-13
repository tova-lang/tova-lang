// Rich error message formatter for the Tova language
// Produces Rust/Elm-style error messages with source context and carets

export class DiagnosticFormatter {
  constructor(source, filename = '<stdin>') {
    this.source = source;
    this.filename = filename;
    this.lines = source.split('\n');
  }

  format(level, message, loc, hint = null) {
    const line = loc.line || 1;
    const column = loc.column || 1;
    const lineNum = Math.max(1, Math.min(line, this.lines.length));
    const gutterWidth = String(lineNum + 1).length;

    let output = '';

    // Header
    const levelStr = level === 'error' ? 'error' : 'warning';
    output += `${levelStr}: ${message}\n`;
    output += `${' '.repeat(gutterWidth)} --> ${this.filename}:${lineNum}:${column}\n`;

    // Context lines
    const startLine = Math.max(1, lineNum - 2);
    const endLine = Math.min(this.lines.length, lineNum + 1);

    output += `${' '.repeat(gutterWidth)} |\n`;

    for (let i = startLine; i <= endLine; i++) {
      const lineContent = this.lines[i - 1] || '';
      const lineStr = String(i).padStart(gutterWidth);

      if (i === lineNum) {
        // The error line
        output += `${lineStr} | ${lineContent}\n`;
        // Caret pointer
        const caretPad = ' '.repeat(Math.max(0, column - 1));
        output += `${' '.repeat(gutterWidth)} | ${caretPad}^\n`;
      } else {
        output += `${lineStr} | ${lineContent}\n`;
      }
    }

    output += `${' '.repeat(gutterWidth)} |\n`;

    // Hint
    if (hint) {
      output += `${' '.repeat(gutterWidth)} = hint: ${hint}\n`;
    }

    return output;
  }

  formatError(message, loc, hint = null) {
    return this.format('error', message, loc, hint);
  }

  formatWarning(message, loc, hint = null) {
    return this.format('warning', message, loc, hint);
  }
}

// Format errors from the Lexer, Parser, or Analyzer
export function formatDiagnostics(source, filename, errors, warnings = []) {
  const formatter = new DiagnosticFormatter(source, filename);
  let output = '';

  for (const err of errors) {
    output += formatter.formatError(
      err.message,
      { line: err.line, column: err.column },
      err.hint
    );
    output += '\n';
  }

  for (const warn of warnings) {
    output += formatter.formatWarning(
      warn.message,
      { line: warn.line, column: warn.column },
      warn.hint
    );
    output += '\n';
  }

  return output;
}

// Helper: extract location from typical Tova error messages
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

// Create a rich error from a Tova parse/analysis error
export function richError(source, error, filename = '<stdin>') {
  const formatter = new DiagnosticFormatter(source, filename);

  // Try to extract location from error message
  const loc = parseErrorLocation(error.message);
  if (loc) {
    // Try to detect hint
    let hint = null;
    if (loc.message.includes("Expected '}'")) {
      hint = "check for a matching opening '{' above";
    } else if (loc.message.includes("Expected ')'")) {
      hint = "check for a matching opening '(' above";
    } else if (loc.message.includes("Expected ']'")) {
      hint = "check for a matching opening '[' above";
    }

    return formatter.formatError(loc.message, { line: loc.line, column: loc.column }, hint);
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
