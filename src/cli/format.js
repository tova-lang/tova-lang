import { resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Formatter } from '../formatter/formatter.js';

export function formatFile(args) {
  const checkOnly = args.includes('--check');
  const files = args.filter(a => !a.startsWith('--'));

  if (files.length === 0) {
    console.error('Error: No file specified');
    console.error('Usage: tova fmt <file.tova> [--check]');
    process.exit(1);
  }

  let hasChanges = false;

  for (const filePath of files) {
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const source = readFileSync(resolved, 'utf-8');
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, resolved);
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);

    if (checkOnly) {
      if (formatted !== source) {
        console.log(`Would reformat: ${filePath}`);
        hasChanges = true;
      }
    } else {
      if (formatted !== source) {
        writeFileSync(resolved, formatted);
        console.log(`Formatted: ${filePath}`);
      } else {
        console.log(`Already formatted: ${filePath}`);
      }
    }
  }

  if (checkOnly && hasChanges) {
    process.exit(1);
  }
}
