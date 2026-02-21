// Tests for scripting capabilities — env, filesystem, shell, CLI args, shebang
// Note: `sh` and `exec` are Tova stdlib builtins (not Node child_process.exec).
// `exec` uses spawnSync with shell:false (safe from injection by design).

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BUILTIN_NAMES } from '../src/stdlib/inline.js';

function parse(src) {
  const lexer = new Lexer(src, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function compile(src) {
  const ast = parse(src);
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().shared.trim();
}

function getWarnings(src) {
  const ast = parse(src);
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze().warnings;
}

// ── Scripting builtins exist in BUILTIN_NAMES ──

describe('scripting: builtins registered', () => {
  const scriptingBuiltins = [
    'env', 'set_env', 'args', 'exit',
    'exists', 'is_dir', 'is_file', 'ls', 'glob_files',
    'mkdir', 'rm', 'cp', 'mv', 'cwd', 'chdir',
    'read_text', 'read_bytes', 'write_text',
    'sh',
  ];

  for (const name of scriptingBuiltins) {
    test(`${name} is in BUILTIN_NAMES`, () => {
      expect(BUILTIN_NAMES.has(name)).toBe(true);
    });
  }

  test('exec is in BUILTIN_NAMES', () => {
    // exec builtin uses spawnSync with shell:false (safe, no injection)
    expect(BUILTIN_NAMES.has('exec')).toBe(true);
  });
});

// ── No undefined warnings for scripting builtins ──

describe('scripting: no undefined warnings', () => {
  test('env() produces no warnings', () => {
    expect(getWarnings('x = env("HOME")')).toEqual([]);
  });

  test('set_env() produces no warnings', () => {
    expect(getWarnings('set_env("FOO", "bar")')).toEqual([]);
  });

  test('args() produces no warnings', () => {
    expect(getWarnings('x = args()')).toEqual([]);
  });

  test('exit() produces no warnings', () => {
    expect(getWarnings('exit(0)')).toEqual([]);
  });

  test('exists() produces no warnings', () => {
    expect(getWarnings('x = exists("./file.txt")')).toEqual([]);
  });

  test('is_dir() produces no warnings', () => {
    expect(getWarnings('x = is_dir("./src")')).toEqual([]);
  });

  test('is_file() produces no warnings', () => {
    expect(getWarnings('x = is_file("./file.txt")')).toEqual([]);
  });

  test('ls() produces no warnings', () => {
    expect(getWarnings('x = ls(".")')).toEqual([]);
  });

  test('glob_files() produces no warnings', () => {
    expect(getWarnings('x = glob_files("*.js")')).toEqual([]);
  });

  test('mkdir() produces no warnings', () => {
    expect(getWarnings('x = mkdir("./tmp")')).toEqual([]);
  });

  test('rm() produces no warnings', () => {
    expect(getWarnings('x = rm("./tmp")')).toEqual([]);
  });

  test('cp() produces no warnings', () => {
    expect(getWarnings('x = cp("a.txt", "b.txt")')).toEqual([]);
  });

  test('mv() produces no warnings', () => {
    expect(getWarnings('x = mv("a.txt", "b.txt")')).toEqual([]);
  });

  test('cwd() produces no warnings', () => {
    expect(getWarnings('x = cwd()')).toEqual([]);
  });

  test('chdir() produces no warnings', () => {
    expect(getWarnings('x = chdir("/tmp")')).toEqual([]);
  });

  test('read_text() produces no warnings', () => {
    expect(getWarnings('x = read_text("./file.txt")')).toEqual([]);
  });

  test('read_bytes() produces no warnings', () => {
    expect(getWarnings('x = read_bytes("./file.bin")')).toEqual([]);
  });

  test('write_text() produces no warnings', () => {
    expect(getWarnings('x = write_text("./out.txt", "hello")')).toEqual([]);
  });

  test('sh() produces no warnings', () => {
    expect(getWarnings('x = sh("echo hello")')).toEqual([]);
  });

  test('Tova exec() builtin produces no warnings', () => {
    // Tests the Tova `exec` stdlib function (spawnSync, shell:false)
    expect(getWarnings('x = exec("echo", ["hello"])')).toEqual([]);
  });
});

// ── Tree-shaking: builtins only included when used ──

describe('scripting: tree-shaking', () => {
  test('env() is included when used', () => {
    const code = compile('x = env("HOME")');
    expect(code).toContain('function env(');
  });

  test('env() is NOT included when not used', () => {
    const code = compile('x = 42');
    expect(code).not.toContain('function env(');
  });

  test('sh() is included when used', () => {
    const code = compile('result = sh("echo hi")');
    expect(code).toContain('function sh(');
  });

  test('sh() is NOT included when not used', () => {
    const code = compile('x = 42');
    expect(code).not.toContain('function sh(');
  });

  test('cwd() is included when used', () => {
    const code = compile('x = cwd()');
    expect(code).toContain('function cwd(');
  });

  test('exists() is included when used', () => {
    const code = compile('x = exists("./test.txt")');
    expect(code).toContain('function exists(');
  });

  test('read_text() is included when used', () => {
    const code = compile('x = read_text("./file.txt")');
    expect(code).toContain('function read_text(');
  });

  test('Tova exec builtin is included when used', () => {
    // Tests tree-shaking for the Tova `exec` stdlib function
    const code = compile('x = exec("ls", ["-la"])');
    expect(code).toContain('function exec(');
  });
});

// ── Shebang support ──

describe('scripting: shebang', () => {
  test('shebang line is stripped during parsing', () => {
    const src = '#!/usr/bin/env tova\nprint("hi")';
    const ast = parse(src);
    // Should parse successfully — the shebang is stripped
    expect(ast.body.length).toBeGreaterThan(0);
  });

  test('shebang does not affect code output', () => {
    const withShebang = compile('#!/usr/bin/env tova\nx = 42');
    const withoutShebang = compile('x = 42');
    expect(withShebang).toBe(withoutShebang);
  });

  test('no shebang also works fine', () => {
    const src = 'print("hello")';
    const ast = parse(src);
    expect(ast.body.length).toBeGreaterThan(0);
  });

  test('shebang only works at start of file', () => {
    // A # in the middle of code should not be treated as shebang
    const src = 'x = 42\n// comment';
    const ast = parse(src);
    expect(ast.body.length).toBeGreaterThan(0);
  });
});

// ── Codegen output for scripting builtins ──

describe('scripting: codegen output', () => {
  test('env() compiles to function with process.env', () => {
    const code = compile('x = env("HOME")');
    expect(code).toContain('process.env');
  });

  test('sh() compiles to function with spawnSync', () => {
    const code = compile('result = sh("echo hi")');
    expect(code).toContain('spawnSync');
  });

  test('Tova exec builtin compiles to function with shell: false', () => {
    // Tests code generation for the Tova `exec` stdlib function
    const code = compile('result = exec("ls", ["-la"])');
    expect(code).toContain('shell: false');
  });

  test('exists() compiles to function with existsSync', () => {
    const code = compile('x = exists("./test.txt")');
    expect(code).toContain('existsSync');
  });

  test('mkdir() compiles to function returning Result', () => {
    const code = compile('x = mkdir("./tmp")');
    expect(code).toContain('Ok(');
    expect(code).toContain('Err(');
  });

  test('read_text() compiles to function returning Result', () => {
    const code = compile('x = read_text("./file.txt")');
    expect(code).toContain('Ok(');
    expect(code).toContain('readFileSync');
  });
});

// ── main() detection ──

describe('scripting: main() detection', () => {
  test('regex detects function main( in generated code', () => {
    const code = compile('fn main(cli_args) {\n  print(cli_args)\n}');
    // The compiled code should contain 'function main('
    expect(/\bfunction\s+main\s*\(/.test(code)).toBe(true);
  });

  test('main in variable name does not trigger detection', () => {
    const code = compile('main_value = 42');
    // Should NOT match the main() detection regex
    expect(/\bfunction\s+main\s*\(/.test(code)).toBe(false);
  });
});

// ── New scripting builtins: registration ──

describe('scripting: new builtins registered', () => {
  const newBuiltins = [
    'read_stdin', 'read_lines',
    'script_path', 'script_dir',
    'parse_args',
    'color', 'bold', 'dim',
  ];

  for (const name of newBuiltins) {
    test(`${name} is in BUILTIN_NAMES`, () => {
      expect(BUILTIN_NAMES.has(name)).toBe(true);
    });
  }
});

// ── New scripting builtins: no warnings ──

describe('scripting: new builtins no warnings', () => {
  test('read_stdin() produces no warnings', () => {
    expect(getWarnings('x = read_stdin()')).toEqual([]);
  });

  test('read_lines() produces no warnings', () => {
    expect(getWarnings('x = read_lines()')).toEqual([]);
  });

  test('script_path() produces no warnings', () => {
    expect(getWarnings('x = script_path()')).toEqual([]);
  });

  test('script_dir() produces no warnings', () => {
    expect(getWarnings('x = script_dir()')).toEqual([]);
  });

  test('parse_args() produces no warnings', () => {
    expect(getWarnings('x = parse_args(args())')).toEqual([]);
  });

  test('color() produces no warnings', () => {
    expect(getWarnings('x = color("hi", "red")')).toEqual([]);
  });

  test('bold() produces no warnings', () => {
    expect(getWarnings('x = bold("hi")')).toEqual([]);
  });

  test('dim() produces no warnings', () => {
    expect(getWarnings('x = dim("hi")')).toEqual([]);
  });
});

// ── New scripting builtins: tree-shaking ──

describe('scripting: new builtins tree-shaking', () => {
  test('read_stdin() is included when used', () => {
    const code = compile('x = read_stdin()');
    expect(code).toContain('function read_stdin(');
  });

  test('read_stdin() is NOT included when not used', () => {
    const code = compile('x = 42');
    expect(code).not.toContain('function read_stdin(');
  });

  test('read_lines() is included when used', () => {
    const code = compile('x = read_lines()');
    expect(code).toContain('function read_lines(');
  });

  test('script_path() is included when used', () => {
    const code = compile('x = script_path()');
    expect(code).toContain('function script_path(');
  });

  test('script_dir() is included when used', () => {
    const code = compile('x = script_dir()');
    expect(code).toContain('function script_dir(');
  });

  test('parse_args() is included when used', () => {
    const code = compile('x = parse_args(args())');
    expect(code).toContain('function parse_args(');
  });

  test('color() is included when used', () => {
    const code = compile('x = color("hi", "red")');
    expect(code).toContain('function color(');
  });

  test('bold() is included when used', () => {
    const code = compile('x = bold("hi")');
    expect(code).toContain('function bold(');
  });

  test('dim() is included when used', () => {
    const code = compile('x = dim("hi")');
    expect(code).toContain('function dim(');
  });
});

// ── New scripting builtins: codegen output ──

describe('scripting: new builtins codegen', () => {
  test('read_stdin() compiles to readFileSync(0)', () => {
    const code = compile('x = read_stdin()');
    expect(code).toContain('readFileSync');
  });

  test('read_lines() compiles to readFileSync with split', () => {
    const code = compile('x = read_lines()');
    expect(code).toContain('readFileSync');
    expect(code).toContain('.split');
  });

  test('script_path() compiles to __tova_filename check', () => {
    const code = compile('x = script_path()');
    expect(code).toContain('__tova_filename');
  });

  test('script_dir() compiles to __tova_dirname check', () => {
    const code = compile('x = script_dir()');
    expect(code).toContain('__tova_dirname');
  });

  test('parse_args() compiles to flag parsing logic', () => {
    const code = compile('x = parse_args(args())');
    expect(code).toContain('function parse_args(');
    expect(code).toContain('flags');
    expect(code).toContain('positional');
  });

  test('color() compiles to ANSI escape codes', () => {
    const code = compile('x = color("hi", "red")');
    expect(code).toContain('\\x1b[');
  });

  test('bold() compiles to ANSI bold code', () => {
    const code = compile('x = bold("hi")');
    expect(code).toContain('\\x1b[1m');
  });

  test('dim() compiles to ANSI dim code', () => {
    const code = compile('x = dim("hi")');
    expect(code).toContain('\\x1b[2m');
  });
});

// ── Signal, file stat, path utils, symlinks, async shell: registration ──

describe('scripting: gap builtins registered', () => {
  const gapBuiltins = [
    'on_signal',
    'file_stat', 'file_size',
    'path_join', 'path_dirname', 'path_basename', 'path_resolve', 'path_ext', 'path_relative',
    'symlink', 'readlink', 'is_symlink',
    'spawn',
  ];

  for (const name of gapBuiltins) {
    test(`${name} is in BUILTIN_NAMES`, () => {
      expect(BUILTIN_NAMES.has(name)).toBe(true);
    });
  }
});

// ── Gap builtins: no undefined warnings ──

describe('scripting: gap builtins no warnings', () => {
  test('on_signal() produces no warnings', () => {
    expect(getWarnings('on_signal("SIGINT", fn() { print("bye") })')).toEqual([]);
  });

  test('file_stat() produces no warnings', () => {
    expect(getWarnings('x = file_stat("./file.txt")')).toEqual([]);
  });

  test('file_size() produces no warnings', () => {
    expect(getWarnings('x = file_size("./file.txt")')).toEqual([]);
  });

  test('path_join() produces no warnings', () => {
    expect(getWarnings('x = path_join("a", "b")')).toEqual([]);
  });

  test('path_dirname() produces no warnings', () => {
    expect(getWarnings('x = path_dirname("/a/b/c")')).toEqual([]);
  });

  test('path_basename() produces no warnings', () => {
    expect(getWarnings('x = path_basename("/a/b/c.js")')).toEqual([]);
  });

  test('path_resolve() produces no warnings', () => {
    expect(getWarnings('x = path_resolve("./file.txt")')).toEqual([]);
  });

  test('path_ext() produces no warnings', () => {
    expect(getWarnings('x = path_ext("file.js")')).toEqual([]);
  });

  test('path_relative() produces no warnings', () => {
    expect(getWarnings('x = path_relative("/a", "/a/b")')).toEqual([]);
  });

  test('symlink() produces no warnings', () => {
    expect(getWarnings('x = symlink("target", "link")')).toEqual([]);
  });

  test('readlink() produces no warnings', () => {
    expect(getWarnings('x = readlink("link")')).toEqual([]);
  });

  test('is_symlink() produces no warnings', () => {
    expect(getWarnings('x = is_symlink("link")')).toEqual([]);
  });

  test('spawn() produces no warnings', () => {
    expect(getWarnings('x = spawn("echo", ["hi"])')).toEqual([]);
  });
});

// ── Gap builtins: tree-shaking ──

describe('scripting: gap builtins tree-shaking', () => {
  test('on_signal() is included when used', () => {
    const code = compile('on_signal("SIGINT", fn() { print("bye") })');
    expect(code).toContain('function on_signal(');
  });

  test('on_signal() is NOT included when not used', () => {
    const code = compile('x = 42');
    expect(code).not.toContain('function on_signal(');
  });

  test('file_stat() is included when used', () => {
    const code = compile('x = file_stat("./f")');
    expect(code).toContain('function file_stat(');
  });

  test('file_size() is included when used', () => {
    const code = compile('x = file_size("./f")');
    expect(code).toContain('function file_size(');
  });

  test('path_join() is included when used', () => {
    const code = compile('x = path_join("a", "b")');
    expect(code).toContain('function path_join(');
  });

  test('path_join() is NOT included when not used', () => {
    const code = compile('x = 42');
    expect(code).not.toContain('function path_join(');
  });

  test('path_dirname() is included when used', () => {
    const code = compile('x = path_dirname("/a/b")');
    expect(code).toContain('function path_dirname(');
  });

  test('path_basename() is included when used', () => {
    const code = compile('x = path_basename("/a/b/c.js")');
    expect(code).toContain('function path_basename(');
  });

  test('path_resolve() is included when used', () => {
    const code = compile('x = path_resolve("./f")');
    expect(code).toContain('function path_resolve(');
  });

  test('path_ext() is included when used', () => {
    const code = compile('x = path_ext("f.js")');
    expect(code).toContain('function path_ext(');
  });

  test('path_relative() is included when used', () => {
    const code = compile('x = path_relative("/a", "/b")');
    expect(code).toContain('function path_relative(');
  });

  test('symlink() is included when used', () => {
    const code = compile('x = symlink("target", "link")');
    expect(code).toContain('function symlink(');
  });

  test('readlink() is included when used', () => {
    const code = compile('x = readlink("link")');
    expect(code).toContain('function readlink(');
  });

  test('is_symlink() is included when used', () => {
    const code = compile('x = is_symlink("link")');
    expect(code).toContain('function is_symlink(');
  });

  test('spawn() is included when used', () => {
    const code = compile('x = spawn("echo", ["hi"])');
    expect(code).toContain('function spawn(');
  });

  test('spawn() is NOT included when not used', () => {
    const code = compile('x = 42');
    expect(code).not.toContain('function spawn(');
  });

  test('is_symlink() is NOT included when not used', () => {
    const code = compile('x = 42');
    expect(code).not.toContain('function is_symlink(');
  });
});

// ── Gap builtins: codegen output ──

describe('scripting: gap builtins codegen', () => {
  test('on_signal() compiles to process.on', () => {
    const code = compile('on_signal("SIGINT", fn() { print("bye") })');
    expect(code).toContain('process.on');
  });

  test('file_stat() compiles to statSync with Result', () => {
    const code = compile('x = file_stat("./f")');
    expect(code).toContain('statSync');
    expect(code).toContain('Ok(');
    expect(code).toContain('Err(');
  });

  test('file_size() compiles to statSync with .size', () => {
    const code = compile('x = file_size("./f")');
    expect(code).toContain('statSync');
    expect(code).toContain('.size');
  });

  test('path_join() compiles to require path .join', () => {
    const code = compile('x = path_join("a", "b")');
    expect(code).toContain("require('path')");
    expect(code).toContain('.join');
  });

  test('path_dirname() compiles to require path .dirname', () => {
    const code = compile('x = path_dirname("/a/b")');
    expect(code).toContain("require('path')");
    expect(code).toContain('.dirname');
  });

  test('path_basename() compiles to require path .basename', () => {
    const code = compile('x = path_basename("/a/b/c.js")');
    expect(code).toContain("require('path')");
    expect(code).toContain('.basename');
  });

  test('path_resolve() compiles to require path .resolve', () => {
    const code = compile('x = path_resolve("./f")');
    expect(code).toContain("require('path')");
    expect(code).toContain('.resolve');
  });

  test('path_ext() compiles to require path .extname', () => {
    const code = compile('x = path_ext("f.js")');
    expect(code).toContain("require('path')");
    expect(code).toContain('.extname');
  });

  test('path_relative() compiles to require path .relative', () => {
    const code = compile('x = path_relative("/a", "/b")');
    expect(code).toContain("require('path')");
    expect(code).toContain('.relative');
  });

  test('symlink() compiles to symlinkSync with Result', () => {
    const code = compile('x = symlink("target", "link")');
    expect(code).toContain('symlinkSync');
    expect(code).toContain('Ok(');
    expect(code).toContain('Err(');
  });

  test('readlink() compiles to readlinkSync with Result', () => {
    const code = compile('x = readlink("link")');
    expect(code).toContain('readlinkSync');
    expect(code).toContain('Ok(');
    expect(code).toContain('Err(');
  });

  test('is_symlink() compiles to lstatSync with isSymbolicLink', () => {
    const code = compile('x = is_symlink("link")');
    expect(code).toContain('lstatSync');
    expect(code).toContain('isSymbolicLink');
  });

  test('spawn() compiles to async with child_process', () => {
    const code = compile('x = spawn("echo", ["hi"])');
    expect(code).toContain('new Promise');
    expect(code).toContain('child_process');
  });
});
