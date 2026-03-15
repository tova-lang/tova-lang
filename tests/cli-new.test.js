import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

const TOVA = path.join(__dirname, '..', 'bin', 'tova.js');

function runTova(args, opts = {}) {
  return spawnSync('bun', [TOVA, ...args], {
    encoding: 'utf-8', timeout: 30000, ...opts,
  });
}

// Create a fresh temp dir for each test to avoid collisions
let tmpDir;
beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `tova-new-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

// ─── Error Cases ────────────────────────────────────────────

describe('tova new — error cases', () => {
  test('no project name produces error', () => {
    const result = runTova(['new'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No project name');
  });

  test('directory already exists produces error', () => {
    const projDir = path.join(tmpDir, 'existing');
    mkdirSync(projDir, { recursive: true });
    const result = runTova(['new', 'existing', '--template', 'blank'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists');
  });

  test('unknown template produces error', () => {
    const result = runTova(['new', 'myapp', '--template', 'nonexistent'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown template');
  });
});

// ─── Helper to verify common scaffolding ────────────────────

function expectCommonFiles(projDir) {
  expect(existsSync(path.join(projDir, 'tova.toml'))).toBe(true);
  expect(existsSync(path.join(projDir, '.gitignore'))).toBe(true);
  expect(existsSync(path.join(projDir, 'README.md'))).toBe(true);
}

function expectTomlHasProjectName(projDir, name) {
  const toml = readFileSync(path.join(projDir, 'tova.toml'), 'utf-8');
  expect(toml).toContain(name);
}

// ─── Template: fullstack ────────────────────────────────────

describe('tova new — fullstack template', () => {
  test('creates project with fullstack structure', () => {
    const result = runTova(['new', 'myapp', '--template', 'fullstack'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'myapp');
    expectCommonFiles(projDir);
    expect(existsSync(path.join(projDir, 'src', 'app.tova'))).toBe(true);

    expectTomlHasProjectName(projDir, 'myapp');

    // tova.toml should have entry and dev port
    const toml = readFileSync(path.join(projDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('entry');
    expect(toml).toContain('port');

    // app.tova should have server and browser blocks
    const appContent = readFileSync(path.join(projDir, 'src', 'app.tova'), 'utf-8');
    expect(appContent).toContain('server {');
    expect(appContent).toContain('browser {');
    expect(appContent).toContain('shared {');
  });

  test('fullstack with --auth creates auth files', () => {
    const result = runTova(['new', 'authapp', '--template', 'fullstack', '--auth'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'authapp');
    expectCommonFiles(projDir);
    expect(existsSync(path.join(projDir, '.env'))).toBe(true);
    expect(existsSync(path.join(projDir, '.env.example'))).toBe(true);

    const appContent = readFileSync(path.join(projDir, 'src', 'app.tova'), 'utf-8');
    expect(appContent).toContain('auth {');
    expect(appContent).toContain('security {');

    // .gitignore should include .env
    const gitignore = readFileSync(path.join(projDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.env');

    // .env should have AUTH_SECRET
    const envContent = readFileSync(path.join(projDir, '.env'), 'utf-8');
    expect(envContent).toContain('AUTH_SECRET=');
  });
});

// ─── Template: spa ──────────────────────────────────────────

describe('tova new — spa template', () => {
  test('creates SPA structure', () => {
    const result = runTova(['new', 'myapp', '--template', 'spa'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'myapp');
    expectCommonFiles(projDir);
    expect(existsSync(path.join(projDir, 'src', 'app.tova'))).toBe(true);

    const appContent = readFileSync(path.join(projDir, 'src', 'app.tova'), 'utf-8');
    expect(appContent).toContain('browser {');
    expect(appContent).toContain('createRouter');

    // SPA should have deploy base config
    const toml = readFileSync(path.join(projDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('base');
  });

  test('spa with --auth creates auth files', () => {
    const result = runTova(['new', 'spaauth', '--template', 'spa', '--auth'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'spaauth');
    expect(existsSync(path.join(projDir, '.env'))).toBe(true);

    const appContent = readFileSync(path.join(projDir, 'src', 'app.tova'), 'utf-8');
    expect(appContent).toContain('auth {');
    expect(appContent).toContain('protected_route');
  });
});

// ─── Template: api ──────────────────────────────────────────

describe('tova new — api template', () => {
  test('creates API-only structure', () => {
    const result = runTova(['new', 'myapi', '--template', 'api'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'myapi');
    expectCommonFiles(projDir);
    expect(existsSync(path.join(projDir, 'src', 'app.tova'))).toBe(true);

    const appContent = readFileSync(path.join(projDir, 'src', 'app.tova'), 'utf-8');
    expect(appContent).toContain('server {');
    expect(appContent).toContain('route GET');
    // API template should not have browser block
    expect(appContent).not.toContain('browser {');
  });
});

// ─── Template: site ─────────────────────────────────────────

describe('tova new — site template', () => {
  test('creates static site structure with page components', () => {
    const result = runTova(['new', 'mysite', '--template', 'site'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'mysite');
    expectCommonFiles(projDir);
    expect(existsSync(path.join(projDir, 'src', 'app.tova'))).toBe(true);

    // Site template has extra page files
    expect(existsSync(path.join(projDir, 'src', 'pages', 'home.tova'))).toBe(true);
    expect(existsSync(path.join(projDir, 'src', 'pages', 'docs.tova'))).toBe(true);
    expect(existsSync(path.join(projDir, 'src', 'pages', 'about.tova'))).toBe(true);

    // Main app should import pages
    const appContent = readFileSync(path.join(projDir, 'src', 'app.tova'), 'utf-8');
    expect(appContent).toContain('import');
    expect(appContent).toContain('browser {');
    expect(appContent).toContain('createRouter');

    // Page components should be pub
    const homeContent = readFileSync(path.join(projDir, 'src', 'pages', 'home.tova'), 'utf-8');
    expect(homeContent).toContain('pub component');
  });
});

// ─── Template: script ───────────────────────────────────────

describe('tova new — script template', () => {
  test('creates script structure with main.tova', () => {
    const result = runTova(['new', 'myscript', '--template', 'script'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'myscript');
    expectCommonFiles(projDir);
    expect(existsSync(path.join(projDir, 'src', 'main.tova'))).toBe(true);

    const mainContent = readFileSync(path.join(projDir, 'src', 'main.tova'), 'utf-8');
    expect(mainContent).toContain('print(');
  });
});

// ─── Template: library ──────────────────────────────────────

describe('tova new — library template', () => {
  test('creates library structure with lib.tova and package section in toml', () => {
    const result = runTova(['new', 'mylib', '--template', 'library'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'mylib');
    expectCommonFiles(projDir);
    expect(existsSync(path.join(projDir, 'src', 'lib.tova'))).toBe(true);

    const libContent = readFileSync(path.join(projDir, 'src', 'lib.tova'), 'utf-8');
    expect(libContent).toContain('pub fn');
    expect(libContent).toContain('greet');

    // Library uses [package] not [project]
    const toml = readFileSync(path.join(projDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('[package]');
    expect(toml).toContain('exports');
    expect(toml).toContain('license');

    // README should have publishing instructions
    const readme = readFileSync(path.join(projDir, 'README.md'), 'utf-8');
    expect(readme).toContain('Publishing');
    expect(readme).toContain('tova add');
  });
});

// ─── Template: blank ────────────────────────────────────────

describe('tova new — blank template', () => {
  test('creates minimal structure with no source file', () => {
    const result = runTova(['new', 'myblank', '--template', 'blank'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'myblank');
    expectCommonFiles(projDir);

    // Blank template should not create an app.tova or main.tova
    expect(existsSync(path.join(projDir, 'src', 'app.tova'))).toBe(false);
    expect(existsSync(path.join(projDir, 'src', 'main.tova'))).toBe(false);

    // But the src directory should exist
    expect(existsSync(path.join(projDir, 'src'))).toBe(true);
  });
});

// ─── .gitignore contents ────────────────────────────────────

describe('tova new — .gitignore', () => {
  test('.gitignore contains standard entries', () => {
    runTova(['new', 'myapp', '--template', 'api'], { cwd: tmpDir });
    const gitignore = readFileSync(path.join(tmpDir, 'myapp', '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.tova-out/');
    expect(gitignore).toContain('*.db');
  });
});

// ─── README contents ────────────────────────────────────────

describe('tova new — README.md', () => {
  test('README contains project name and getting started', () => {
    runTova(['new', 'myapp', '--template', 'fullstack'], { cwd: tmpDir });
    const readme = readFileSync(path.join(tmpDir, 'myapp', 'README.md'), 'utf-8');
    expect(readme).toContain('# myapp');
    expect(readme).toContain('Tova');
    expect(readme).toContain('tova');
  });
});

// ─── Template content is valid Tova ─────────────────────────

describe('tova new — template validity', () => {
  // Templates that produce parseable .tova files
  const templatesWithCode = ['fullstack', 'api', 'script', 'library'];

  for (const tmpl of templatesWithCode) {
    test(`${tmpl} template produces parseable Tova code`, () => {
      const projName = `valid-${tmpl}`;
      runTova(['new', projName, '--template', tmpl], { cwd: tmpDir });
      const projDir = path.join(tmpDir, projName);

      // Find the main .tova file
      const mainFiles = ['src/app.tova', 'src/main.tova', 'src/lib.tova'];
      let tovaFile = null;
      for (const f of mainFiles) {
        if (existsSync(path.join(projDir, f))) {
          tovaFile = path.join(projDir, f);
          break;
        }
      }
      expect(tovaFile).not.toBeNull();

      // Try parsing it — should not throw
      const { Lexer } = require('../src/lexer/lexer.js');
      const { Parser } = require('../src/parser/parser.js');
      const source = readFileSync(tovaFile, 'utf-8');
      const lexer = new Lexer(source, tovaFile);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, tovaFile);
      const ast = parser.parse();
      expect(ast).toBeDefined();
      expect(ast.body.length).toBeGreaterThan(0);
    });
  }
});

// ─── --template=value syntax ────────────────────────────────

describe('tova new — --template=value syntax', () => {
  test('accepts --template=api syntax', () => {
    const result = runTova(['new', 'equalsapp', '--template=api'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const projDir = path.join(tmpDir, 'equalsapp');
    expect(existsSync(path.join(projDir, 'src', 'app.tova'))).toBe(true);

    const appContent = readFileSync(path.join(projDir, 'src', 'app.tova'), 'utf-8');
    expect(appContent).toContain('server {');
  });
});

// ─── Git init ───────────────────────────────────────────────

describe('tova new — git init', () => {
  test('initializes a git repository', () => {
    runTova(['new', 'gitapp', '--template', 'blank'], { cwd: tmpDir });
    const projDir = path.join(tmpDir, 'gitapp');
    // .git should exist if git is available
    expect(existsSync(path.join(projDir, '.git'))).toBe(true);
  });
});

// ─── tova.toml structure ────────────────────────────────────

describe('tova new — tova.toml structure', () => {
  test('fullstack toml has version 0.1.0', () => {
    runTova(['new', 'tomlapp', '--template', 'fullstack'], { cwd: tmpDir });
    const toml = readFileSync(path.join(tmpDir, 'tomlapp', 'tova.toml'), 'utf-8');
    expect(toml).toContain('0.1.0');
  });

  test('script toml has entry field', () => {
    runTova(['new', 'scriptapp', '--template', 'script'], { cwd: tmpDir });
    const toml = readFileSync(path.join(tmpDir, 'scriptapp', 'tova.toml'), 'utf-8');
    expect(toml).toContain('entry');
  });

  test('api toml has npm section', () => {
    runTova(['new', 'apiapp', '--template', 'api'], { cwd: tmpDir });
    const toml = readFileSync(path.join(tmpDir, 'apiapp', 'tova.toml'), 'utf-8');
    expect(toml).toContain('[npm]');
  });
});
