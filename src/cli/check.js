// src/cli/check.js — Type-checking command
import { resolve, dirname, relative } from 'path';
import { readFileSync, existsSync, statSync } from 'fs';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Analyzer } from '../analyzer/analyzer.js';
import { richError, DiagnosticFormatter, formatSummary } from '../diagnostics/formatter.js';
import { getExplanation, lookupCode } from '../diagnostics/error-codes.js';
import { generateSecurityScorecard } from '../diagnostics/security-scorecard.js';
import { findFiles } from './utils.js';

async function checkProject(args) {
  const checkStrict = args.includes('--strict');
  const checkStrictSecurity = args.includes('--strict-security');
  const isVerbose = args.includes('--verbose');
  const isQuiet = args.includes('--quiet');

  // --explain <code>: show explanation for a specific error code inline with check output
  const explainIdx = args.indexOf('--explain');
  const explainCode = explainIdx >= 0 ? args[explainIdx + 1] : null;
  if (explainCode) {
    // If --explain is used standalone, just show the explanation
    const info = lookupCode(explainCode);
    if (!info) {
      console.error(`Unknown error code: ${explainCode}`);
      process.exit(1);
    }
    const explanation = getExplanation(explainCode);
    console.log(`\n  ${explainCode}: ${info.title} [${info.category}]\n`);
    if (explanation) {
      console.log(explanation);
    } else {
      console.log(`  No detailed explanation available yet for ${explainCode}.\n`);
    }
    process.exit(0);
  }

  const explicitSrc = args.filter(a => !a.startsWith('--'))[0];
  const srcPath = resolve(explicitSrc || '.');

  // Support both single file and directory arguments
  let tovaFiles;
  if (existsSync(srcPath) && statSync(srcPath).isFile()) {
    tovaFiles = srcPath.endsWith('.tova') ? [srcPath] : [];
  } else {
    tovaFiles = findFiles(srcPath, '.tova');
  }
  const srcDir = existsSync(srcPath) && statSync(srcPath).isFile() ? dirname(srcPath) : srcPath;
  if (tovaFiles.length === 0) {
    console.error('No .tova files found');
    process.exit(1);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const seenCodes = new Set();
  let _checkScorecardData = null;
  const _allCheckWarnings = [];

  for (const file of tovaFiles) {
    const relPath = relative(srcDir, file);
    const start = Date.now();
    try {
      const source = readFileSync(file, 'utf-8');
      const lexer = new Lexer(source, file);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, file);
      const ast = parser.parse();
      const analyzer = new Analyzer(ast, file, { strict: checkStrict, strictSecurity: checkStrictSecurity, tolerant: true });
      const result = analyzer.analyze();

      const errors = result.errors || [];
      const warnings = result.warnings || [];
      totalErrors += errors.length;
      totalWarnings += warnings.length;
      _allCheckWarnings.push(...warnings);

      // Collect security info for scorecard
      if (!_checkScorecardData) {
        const hasServer = ast.body.some(n => n.type === 'ServerBlock');
        const hasEdge = ast.body.some(n => n.type === 'EdgeBlock');
        if (hasServer || hasEdge) {
          const secNode = ast.body.find(n => n.type === 'SecurityBlock');
          let secCfg = null;
          if (secNode) {
            secCfg = {};
            for (const child of secNode.body || []) {
              if (child.type === 'AuthDeclaration') secCfg.auth = { authType: child.authType || 'jwt', storage: child.config?.storage?.value };
              else if (child.type === 'CsrfDeclaration') secCfg.csrf = { enabled: child.config?.enabled?.value !== false };
              else if (child.type === 'RateLimitDeclaration') secCfg.rateLimit = { max: child.config?.max?.value };
              else if (child.type === 'CspDeclaration') secCfg.csp = { default_src: true };
              else if (child.type === 'CorsDeclaration') {
                const origins = child.config?.origins;
                secCfg.cors = { origins: origins ? (origins.elements || []).map(e => e.value) : [] };
              }
              else if (child.type === 'AuditDeclaration') secCfg.audit = { events: ['auth'] };
            }
          }
          _checkScorecardData = { securityConfig: secCfg, hasServer, hasEdge };
        }
      }

      if (errors.length > 0 || warnings.length > 0) {
        const formatter = new DiagnosticFormatter(source, file);
        for (const e of errors) {
          console.error(formatter.formatError(e.message, { line: e.line, column: e.column }, { hint: e.hint, code: e.code, length: e.length, fix: e.fix }));
          if (e.code) seenCodes.add(e.code);
        }
        for (const w of warnings) {
          console.warn(formatter.formatWarning(w.message, { line: w.line, column: w.column }, { hint: w.hint, code: w.code, length: w.length, fix: w.fix }));
          if (w.code) seenCodes.add(w.code);
        }
      }

      if (isVerbose) {
        const elapsed = Date.now() - start;
        console.log(`  ✓ ${relPath} (${elapsed}ms)`);
      }
    } catch (err) {
      totalErrors++;
      if (err.errors) {
        const source = readFileSync(file, 'utf-8');
        console.error(richError(source, err, file));
      } else {
        console.error(`  ✗ ${relPath}: ${err.message}`);
      }
    }
  }

  // Security scorecard (shown with --verbose or --strict-security, suppressed with --quiet)
  if ((isVerbose || checkStrictSecurity) && !isQuiet && _checkScorecardData) {
    const scorecard = generateSecurityScorecard(
      _checkScorecardData.securityConfig,
      _allCheckWarnings,
      _checkScorecardData.hasServer,
      _checkScorecardData.hasEdge
    );
    if (scorecard) console.log(scorecard.format());
  }

  if (!isQuiet) {
    console.log(`\n  ${tovaFiles.length} file${tovaFiles.length === 1 ? '' : 's'} checked, ${formatSummary(totalErrors, totalWarnings)}`);
    // Show explain hint for encountered error codes
    if (seenCodes.size > 0 && (totalErrors > 0 || totalWarnings > 0)) {
      const codes = [...seenCodes].sort().slice(0, 5).join(', ');
      const more = seenCodes.size > 5 ? ` and ${seenCodes.size - 5} more` : '';
      console.log(`\n  Run \`tova explain <code>\` for details on: ${codes}${more}`);
    }
    console.log('');
  }
  if (totalErrors > 0) process.exit(1);
}

export { checkProject };
