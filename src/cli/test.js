import { resolve, basename, dirname, join, relative } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { spawn } from 'child_process';
import { watch as fsWatch } from 'fs';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { CodeGenerator } from '../codegen/codegen.js';
import { getFullStdlib } from '../stdlib/inline.js';

export async function runTests(args) {
  const filterPattern = args.find((a, i) => args[i - 1] === '--filter') || null;
  const watchMode = args.includes('--watch');
  const coverageMode = args.includes('--coverage');
  const serialMode = args.includes('--serial');
  const targetDir = args.find(a => !a.startsWith('--') && a !== filterPattern) || '.';

  // Find all .tova files with test blocks + dedicated test files (*.test.tova, *_test.tova)
  const tovaFiles = findTovaFiles(resolve(targetDir));
  const testFiles = [];

  for (const file of tovaFiles) {
    const base = basename(file);
    // Dedicated test files are always included
    if (base.endsWith('.test.tova') || base.endsWith('_test.tova')) {
      testFiles.push(file);
      continue;
    }
    const source = readFileSync(file, 'utf-8');
    // Quick check for inline test blocks
    if (/\btest\s+["'{]/m.test(source) || /\btest\s*\{/m.test(source)) {
      testFiles.push(file);
    }
  }

  if (testFiles.length === 0) {
    console.log('No test files found.');
    return;
  }

  console.log(`Found ${testFiles.length} test file(s)\n`);

  // Compile test files to temp directory
  const tmpDir = resolve('.tova-test-out');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const compiledFiles = [];

  for (const file of testFiles) {
    try {
      const source = readFileSync(file, 'utf-8');
      const base = basename(file);
      const isDedicatedTestFile = base.endsWith('.test.tova') || base.endsWith('_test.tova');

      // For dedicated test files without explicit test blocks, wrap entire file in one
      let sourceToCompile = source;
      if (isDedicatedTestFile && !/\btest\s+["'{]/m.test(source) && !/\btest\s*\{/m.test(source)) {
        const testName = base.replace(/\.(test|_test)\.tova$/, '').replace(/_test\.tova$/, '');
        sourceToCompile = `test "${testName}" {\n${source}\n}`;
      }

      const lexer = new Lexer(sourceToCompile, file);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, file);
      const ast = parser.parse();

      const codegen = new CodeGenerator(ast, file);
      const result = codegen.generate();

      if (result.test) {
        const relPath = relative(resolve(targetDir), file).replace(/\.tova$/, '.test.js');
        const outPath = join(tmpDir, relPath);
        const outDir = dirname(outPath);
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

        // Shared code (top-level definitions) is now included by generateTests()
        writeFileSync(outPath, result.test);
        compiledFiles.push(outPath);
        console.log(`  Compiled: ${relative('.', file)}`);
      }
    } catch (err) {
      console.error(`  Error compiling ${relative('.', file)}: ${err.message}`);
    }
  }

  if (compiledFiles.length === 0) {
    console.log('\nNo test blocks compiled.');
    return;
  }

  console.log(`\nRunning ${compiledFiles.length} test file(s)...\n`);

  // Run tests via bun test
  const bunArgs = ['test', ...compiledFiles];
  if (filterPattern) {
    bunArgs.push('-t', filterPattern);
  }
  if (coverageMode) {
    bunArgs.push('--coverage');
  }
  if (serialMode) {
    // Force sequential execution (bun runs files in parallel by default)
    bunArgs.push('--concurrency', '1');
  }

  const runBunTest = () => {
    return new Promise((res) => {
      const proc = spawn('bun', bunArgs, { stdio: 'inherit' });
      proc.on('close', (code) => res(code));
    });
  };

  const exitCode = await runBunTest();

  if (watchMode) {
    console.log('\nWatching for changes... (Ctrl+C to stop)\n');
    const watched = resolve(targetDir);
    fsWatch(watched, { recursive: true }, async (event, filename) => {
      if (filename && filename.endsWith('.tova')) {
        console.log(`\nFile changed: ${filename}\n`);
        // Recompile and re-run
        await runTests(args.filter(a => a !== '--watch'));
      }
    });
  } else {
    // Clean up temp dir on exit (non-watch mode)
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    process.exitCode = exitCode;
  }
}

export async function runBench(args) {
  const targetDir = args.find(a => !a.startsWith('--')) || '.';
  const tovaFiles = findTovaFiles(resolve(targetDir));
  const benchFiles = [];

  for (const file of tovaFiles) {
    const source = readFileSync(file, 'utf-8');
    if (/\bbench\s+["'{]/m.test(source) || /\bbench\s*\{/m.test(source)) {
      benchFiles.push(file);
    }
  }

  if (benchFiles.length === 0) {
    console.log('No bench files found.');
    return;
  }

  console.log(`Found ${benchFiles.length} bench file(s)\n`);

  const tmpDir = resolve('.tova-bench-out');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  for (const file of benchFiles) {
    try {
      const source = readFileSync(file, 'utf-8');
      const lexer = new Lexer(source, file);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, file);
      const ast = parser.parse();

      const codegen = new CodeGenerator(ast, file);
      const result = codegen.generate();

      if (result.bench) {
        const relPath = relative(resolve(targetDir), file).replace(/\.tova$/, '.bench.js');
        const outPath = join(tmpDir, relPath);
        const outDir = dirname(outPath);
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

        const stdlib = getFullStdlib();
        const fullBench = stdlib + '\n' + result.bench;
        writeFileSync(outPath, fullBench);
        console.log(`  Compiled: ${relative('.', file)}`);

        // Run the bench file
        console.log('');
        const proc = spawn('bun', ['run', outPath], { stdio: 'inherit' });
        await new Promise(res => proc.on('close', res));
        console.log('');
      }
    } catch (err) {
      console.error(`  Error compiling ${relative('.', file)}: ${err.message}`);
    }
  }

  // Clean up bench temp dir
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

export async function generateDocs(args) {
  const { DocGenerator } = await import('../docs/generator.js');
  const outputDir = args.find((a, i) => args[i - 1] === '--output' || args[i - 1] === '-o') || 'docs-out';
  const format = args.find((a, i) => args[i - 1] === '--format') || 'html';
  const targetDir = args.find(a => !a.startsWith('--') && a !== outputDir && a !== format) || '.';

  const tovaFiles = findTovaFiles(resolve(targetDir));
  if (tovaFiles.length === 0) {
    console.log('No .tova files found.');
    return;
  }

  const modules = [];
  for (const file of tovaFiles) {
    try {
      const source = readFileSync(file, 'utf-8');
      // Quick check: skip files without docstrings
      if (!source.includes('///')) continue;

      const lexer = new Lexer(source, file);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, file);
      const ast = parser.parse();
      const name = relative(resolve(targetDir), file).replace(/\.tova$/, '').replace(/[/\\]/g, '.');
      modules.push({ name, ast });
    } catch (err) {
      console.error(`  Error parsing ${relative('.', file)}: ${err.message}`);
    }
  }

  if (modules.length === 0) {
    console.log('No documented .tova files found (add /// docstrings to your code).');
    return;
  }

  const generator = new DocGenerator(modules);
  const pages = generator.generate(format);

  const outDir = resolve(outputDir);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (const [filename, content] of Object.entries(pages)) {
    const outPath = join(outDir, filename);
    writeFileSync(outPath, content);
    count++;
  }

  console.log(`Generated ${count} documentation file(s) in ${relative('.', outDir)}/`);
}

export function findTovaFiles(dir) {
  const files = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return files;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...findTovaFiles(full));
    } else if (entry.endsWith('.tova')) {
      files.push(full);
    }
  }
  return files;
}
