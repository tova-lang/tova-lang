#!/usr/bin/env bun
// Validates Tova code blocks in documentation markdown files
// Only validates "full program" blocks (first ```tova block in tutorial files)
// Skips snippet blocks in architecture docs and walkthrough sections

import { readFileSync, readdirSync } from 'fs';
import { resolve, basename } from 'path';
import { Lexer } from './src/lexer/lexer.js';
import { Parser } from './src/parser/parser.js';

const EXAMPLES_DIR = resolve(import.meta.dir, 'docs/examples');

// Only validate the main code block in each tutorial (the "Full Application" block)
const NEW_TUTORIALS = [
  'cli-tool.md',
  'etl-pipeline.md',
  'type-driven.md',
  'ai-assistant.md',
  'api-gateway.md',
  'e-commerce.md',
  'task-queue.md',
  'content-platform.md',
  'monitoring-service.md',
  'real-time-dashboard.md',
];

function extractFirstTovaBlock(markdown, filename) {
  const regex = /```tova\n([\s\S]*?)```/;
  const match = regex.exec(markdown);
  if (!match) return null;
  const code = match[1];
  const beforeBlock = markdown.substring(0, match.index);
  const line = (beforeBlock.match(/\n/g) || []).length + 1;
  return { code, line, filename };
}

function validateBlock(block) {
  const errors = [];

  // Step 1: Lexer
  try {
    const lexer = new Lexer(block.code, block.filename);
    const tokens = lexer.tokenize();

    // Step 2: Parser
    try {
      const parser = new Parser(tokens, block.filename);
      const ast = parser.parse();
    } catch (parseErr) {
      // Collect just the first meaningful error
      const msg = parseErr.message.split('\n')[0];
      errors.push({
        phase: 'PARSER',
        message: msg,
        file: block.filename,
        blockLine: block.line,
      });
    }
  } catch (lexErr) {
    errors.push({
      phase: 'LEXER',
      message: lexErr.message.split('\n')[0],
      file: block.filename,
      blockLine: block.line,
    });
  }

  return errors;
}

// Main
let totalBlocks = 0;
let totalErrors = 0;
const allErrors = [];
const passedFiles = [];

for (const file of NEW_TUTORIALS) {
  const filepath = resolve(EXAMPLES_DIR, file);
  let content;
  try {
    content = readFileSync(filepath, 'utf-8');
  } catch {
    console.log(`  ⚠️  ${file}: File not found`);
    continue;
  }

  const block = extractFirstTovaBlock(content, filepath);
  if (!block) {
    console.log(`  ⚠️  ${file}: No tova code block found`);
    continue;
  }

  totalBlocks++;
  const errors = validateBlock(block);

  if (errors.length === 0) {
    console.log(`  ✅ ${file}: OK (${block.code.split('\n').length} lines)`);
    passedFiles.push(file);
  } else {
    for (const err of errors) {
      totalErrors++;
      console.log(`  ❌ ${file}: ${err.phase} error`);
      console.log(`     ${err.message}`);
      allErrors.push({ ...err, name: file });
    }
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Summary: ${totalBlocks} tutorials validated, ${passedFiles.length} passed, ${totalErrors} failed`);

if (totalErrors > 0) {
  console.log(`\nFailing files:`);
  for (const err of allErrors) {
    console.log(`  ${err.name}: [${err.phase}] ${err.message}`);
  }
}
