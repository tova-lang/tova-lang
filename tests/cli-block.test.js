import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, '<test>', { sourceMaps: false });
  return gen.generate();
}

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

function analyzeTolerant(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>');
  analyzer.tolerant = true;
  return analyzer.analyze();
}

// ─── Parsing ─────────────────────────────────────────────

describe('cli block - parsing', () => {
  test('empty cli block', () => {
    const ast = parse('cli {}');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('CliBlock');
    expect(ast.body[0].config).toHaveLength(0);
    expect(ast.body[0].commands).toHaveLength(0);
  });

  test('config fields', () => {
    const ast = parse(`cli {
      name: "mytool"
      version: "1.0.0"
      description: "A great tool"
    }`);
    const block = ast.body[0];
    expect(block.config).toHaveLength(3);
    expect(block.config[0].key).toBe('name');
    expect(block.config[0].value.value).toBe('mytool');
    expect(block.config[1].key).toBe('version');
    expect(block.config[1].value.value).toBe('1.0.0');
    expect(block.config[2].key).toBe('description');
    expect(block.config[2].value.value).toBe('A great tool');
  });

  test('single command with no params', () => {
    const ast = parse(`cli {
      fn greet() {
        print("hello")
      }
    }`);
    const block = ast.body[0];
    expect(block.commands).toHaveLength(1);
    expect(block.commands[0].name).toBe('greet');
    expect(block.commands[0].params).toHaveLength(0);
    expect(block.commands[0].isAsync).toBe(false);
  });

  test('async command', () => {
    const ast = parse(`cli {
      async fn deploy() {
        print("deploying")
      }
    }`);
    const block = ast.body[0];
    expect(block.commands[0].isAsync).toBe(true);
  });

  test('command with positional params', () => {
    const ast = parse(`cli {
      fn add(name: String, count: Int) {
        print(name)
      }
    }`);
    const cmd = ast.body[0].commands[0];
    expect(cmd.params).toHaveLength(2);
    expect(cmd.params[0].name).toBe('name');
    expect(cmd.params[0].typeAnnotation).toBe('String');
    expect(cmd.params[0].isFlag).toBe(false);
    expect(cmd.params[1].name).toBe('count');
    expect(cmd.params[1].typeAnnotation).toBe('Int');
  });

  test('command with flag params (--prefix)', () => {
    const ast = parse(`cli {
      fn run(target: String, --port: Int = 3000, --verbose: Bool) {
        print(target)
      }
    }`);
    const cmd = ast.body[0].commands[0];
    expect(cmd.params).toHaveLength(3);
    expect(cmd.params[0].isFlag).toBe(false);
    expect(cmd.params[0].name).toBe('target');
    expect(cmd.params[1].isFlag).toBe(true);
    expect(cmd.params[1].name).toBe('port');
    expect(cmd.params[1].typeAnnotation).toBe('Int');
    expect(cmd.params[1].defaultValue.value).toBe(3000);
    expect(cmd.params[2].isFlag).toBe(true);
    expect(cmd.params[2].name).toBe('verbose');
    expect(cmd.params[2].typeAnnotation).toBe('Bool');
  });

  test('optional positional (Type?)', () => {
    const ast = parse(`cli {
      fn init(name: String?) {
        print(name)
      }
    }`);
    const param = ast.body[0].commands[0].params[0];
    expect(param.isOptional).toBe(true);
    expect(param.typeAnnotation).toBe('String');
  });

  test('repeated flag ([Type])', () => {
    const ast = parse(`cli {
      fn build(--include: [String]) {
        print("building")
      }
    }`);
    const param = ast.body[0].commands[0].params[0];
    expect(param.isRepeated).toBe(true);
    expect(param.typeAnnotation).toBe('String');
    expect(param.isFlag).toBe(true);
  });

  test('Bool flag is implicitly optional', () => {
    const ast = parse(`cli {
      fn run(--verbose: Bool) {
        print("running")
      }
    }`);
    const param = ast.body[0].commands[0].params[0];
    expect(param.isOptional).toBe(true);
    expect(param.typeAnnotation).toBe('Bool');
  });

  test('multiple commands', () => {
    const ast = parse(`cli {
      name: "todo"
      fn add(task: String) { print(task) }
      fn list() { print("listing") }
      fn remove(id: Int) { print(id) }
    }`);
    const block = ast.body[0];
    expect(block.commands).toHaveLength(3);
    expect(block.commands[0].name).toBe('add');
    expect(block.commands[1].name).toBe('list');
    expect(block.commands[2].name).toBe('remove');
  });

  test('config and commands interleaved', () => {
    const ast = parse(`cli {
      name: "deploy"
      version: "2.0.0"
      fn deploy(target: String) { print(target) }
      description: "Deploy tool"
    }`);
    const block = ast.body[0];
    expect(block.config).toHaveLength(3);
    expect(block.commands).toHaveLength(1);
  });

  test('default string value', () => {
    const ast = parse(`cli {
      fn run(--env: String = "staging") {
        print(env)
      }
    }`);
    const param = ast.body[0].commands[0].params[0];
    expect(param.defaultValue.value).toBe('staging');
    expect(param.isFlag).toBe(true);
  });
});

// ─── Code Generation ─────────────────────────────────────

describe('cli block - codegen', () => {
  test('produces isCli output', () => {
    const output = compile(`cli {
      name: "test"
      fn greet() { print("hi") }
    }`);
    expect(output.isCli).toBe(true);
    expect(output.cli).toBeDefined();
    expect(typeof output.cli).toBe('string');
  });

  test('generates help handler', () => {
    const output = compile(`cli {
      name: "mytool"
      version: "1.0.0"
      description: "My tool"
      fn greet() { print("hi") }
    }`);
    expect(output.cli).toContain('__cli_help');
    expect(output.cli).toContain('mytool');
    expect(output.cli).toContain('My tool');
    expect(output.cli).toContain('1.0.0');
  });

  test('generates version handler', () => {
    const output = compile(`cli {
      name: "mytool"
      version: "2.5.0"
      fn run() { print("running") }
    }`);
    expect(output.cli).toContain('"--version"');
    expect(output.cli).toContain('2.5.0');
  });

  test('generates command function', () => {
    const output = compile(`cli {
      fn greet(name: String) { print(name) }
    }`);
    expect(output.cli).toContain('function __cmd_greet(name)');
  });

  test('generates async command function', () => {
    const output = compile(`cli {
      async fn deploy() { print("deploying") }
    }`);
    expect(output.cli).toContain('async function __cmd_deploy()');
  });

  test('generates subcommand dispatch for multiple commands', () => {
    const output = compile(`cli {
      name: "tool"
      fn add(task: String) { print(task) }
      fn list() { print("list") }
    }`);
    expect(output.cli).toContain('switch (__subcmd)');
    expect(output.cli).toContain('"add"');
    expect(output.cli).toContain('"list"');
  });

  test('single-command mode skips subcommand routing', () => {
    const output = compile(`cli {
      fn run(target: String) { print(target) }
    }`);
    // Should NOT have subcommand switch
    expect(output.cli).not.toContain('switch (__subcmd)');
    // Should dispatch directly
    expect(output.cli).toContain('__cli_dispatch_run(argv)');
  });

  test('type validation for Int', () => {
    const output = compile(`cli {
      fn serve(--port: Int = 3000) { print(port) }
    }`);
    expect(output.cli).toContain('parseInt');
    expect(output.cli).toContain('isNaN');
  });

  test('type validation for Float', () => {
    const output = compile(`cli {
      fn calc(--rate: Float) { print(rate) }
    }`);
    expect(output.cli).toContain('parseFloat');
  });

  test('Bool toggle flags', () => {
    const output = compile(`cli {
      fn run(--verbose: Bool) { print(verbose) }
    }`);
    expect(output.cli).toContain('__flag_verbose = true');
    expect(output.cli).toContain('"--verbose"');
    expect(output.cli).toContain('"--no-verbose"');
  });

  test('array/repeated flag collection', () => {
    const output = compile(`cli {
      fn build(--include: [String]) { print(include) }
    }`);
    expect(output.cli).toContain('__flag_include = []');
    expect(output.cli).toContain('__flag_include.push');
  });

  test('default values', () => {
    const output = compile(`cli {
      fn run(--env: String = "staging") { print(env) }
    }`);
    expect(output.cli).toContain('"staging"');
  });

  test('auto-invoke at end', () => {
    const output = compile(`cli {
      fn run() { print("hi") }
    }`);
    expect(output.cli).toContain('__cli_main(process.argv.slice(2))');
  });

  test('required arg validation', () => {
    const output = compile(`cli {
      fn deploy(target: String) { print(target) }
    }`);
    expect(output.cli).toContain('Missing required argument');
    expect(output.cli).toContain('target');
  });

  test('unknown flag error', () => {
    const output = compile(`cli {
      fn run() { print("running") }
    }`);
    expect(output.cli).toContain('Unknown flag');
  });

  test('per-command help function', () => {
    const output = compile(`cli {
      name: "tool"
      fn deploy(target: String, --port: Int = 3000) { print(target) }
    }`);
    expect(output.cli).toContain('__cli_command_help_deploy');
    expect(output.cli).toContain('ARGUMENTS');
    expect(output.cli).toContain('OPTIONS');
  });

  test('--flag=value syntax support', () => {
    const output = compile(`cli {
      fn run(--port: Int = 3000) { print(port) }
    }`);
    expect(output.cli).toContain('startsWith("--port=")');
  });

  test('optional positional does not require validation', () => {
    const output = compile(`cli {
      fn init(name: String?) { print(name) }
    }`);
    // Should NOT have "Missing required argument" for name
    expect(output.cli).not.toContain('Missing required argument <name>');
  });

  test('shared/top-level code is included', () => {
    const output = compile(`
      greeting = "Hello"
      cli {
        fn greet() { print(greeting) }
      }
    `);
    expect(output.isCli).toBe(true);
    expect(output.cli).toContain('greeting');
  });
});

// ─── Analyzer ────────────────────────────────────────────

describe('cli block - analyzer', () => {
  test('no warnings for valid cli block', () => {
    const result = analyze(`cli {
      name: "tool"
      version: "1.0.0"
      fn greet(name: String) { print(name) }
    }`);
    const cliWarnings = (result.warnings || []).filter(w => w.code && w.code.startsWith('W_CLI') || w.code === 'W_DUPLICATE_CLI_COMMAND' || w.code === 'W_POSITIONAL_AFTER_FLAG' || w.code === 'W_UNKNOWN_CLI_CONFIG');
    expect(cliWarnings).toHaveLength(0);
  });

  test('warns on unknown config key', () => {
    const result = analyzeTolerant(`cli {
      name: "tool"
      author: "me"
      fn greet() { print("hi") }
    }`);
    const w = result.warnings.find(w => w.code === 'W_UNKNOWN_CLI_CONFIG');
    expect(w).toBeDefined();
    expect(w.message).toContain('author');
  });

  test('warns on duplicate command names', () => {
    const result = analyzeTolerant(`cli {
      name: "tool"
      fn greet() { print("hi") }
      fn greet() { print("hello") }
    }`);
    const w = result.warnings.find(w => w.code === 'W_DUPLICATE_CLI_COMMAND');
    expect(w).toBeDefined();
    expect(w.message).toContain('greet');
  });

  test('warns on positional after flag', () => {
    const result = analyzeTolerant(`cli {
      name: "tool"
      fn run(--verbose: Bool, target: String) { print(target) }
    }`);
    const w = result.warnings.find(w => w.code === 'W_POSITIONAL_AFTER_FLAG');
    expect(w).toBeDefined();
    expect(w.message).toContain('target');
  });

  test('warns on missing name', () => {
    const result = analyzeTolerant(`cli {
      fn greet() { print("hi") }
    }`);
    const w = result.warnings.find(w => w.code === 'W_CLI_MISSING_NAME');
    expect(w).toBeDefined();
  });

  test('command body params are in scope', () => {
    // Should not warn about undefined identifier for 'name'
    const result = analyzeTolerant(`cli {
      name: "tool"
      fn greet(name: String) { print(name) }
    }`);
    const e = (result.errors || []).find(e => e.message && e.message.includes('name'));
    expect(e).toBeUndefined();
  });
});

// ─── Stdlib: Color shortcuts ─────────────────────────────

describe('cli block - stdlib', () => {
  test('color shortcuts compile', () => {
    const output = compile(`
      x = green("ok")
      y = red("fail")
      z = yellow("warn")
    `);
    expect(output.shared).toContain('function green');
    expect(output.shared).toContain('function red');
    expect(output.shared).toContain('function yellow');
    expect(output.shared).toContain('function color'); // dependency
  });

  test('underline compiles', () => {
    const output = compile(`x = underline("text")`);
    expect(output.shared).toContain('function underline');
  });

  test('strikethrough compiles', () => {
    const output = compile(`x = strikethrough("text")`);
    expect(output.shared).toContain('function strikethrough');
  });

  test('table compiles', () => {
    const output = compile(`table([{name: "Alice", age: 30}])`);
    expect(output.shared).toContain('function table');
  });

  test('panel compiles', () => {
    const output = compile(`panel("Title", "Content")`);
    expect(output.shared).toContain('function panel');
  });

  test('progress compiles', () => {
    const output = compile(`
      items = [1, 2, 3]
      for item in progress(items) { print(item) }
    `);
    expect(output.shared).toContain('function progress');
  });

  test('spin compiles', () => {
    const output = compile(`
      async fn main() {
        result = await spin("Loading", async fn() 42)
      }
    `);
    expect(output.shared).toContain('function spin');
  });

  test('ask compiles', () => {
    const output = compile(`
      async fn main() {
        name = await ask("Name?")
      }
    `);
    expect(output.shared).toContain('function ask');
  });

  test('confirm compiles', () => {
    const output = compile(`
      async fn main() {
        ok = await confirm("Continue?")
      }
    `);
    expect(output.shared).toContain('function confirm');
  });

  test('choose compiles', () => {
    const output = compile(`
      async fn main() {
        lang = await choose("Pick:", ["JS", "Python", "Rust"])
      }
    `);
    expect(output.shared).toContain('function choose');
  });

  test('choose_many compiles', () => {
    const output = compile(`
      async fn main() {
        langs = await choose_many("Pick:", ["JS", "Python", "Rust"])
      }
    `);
    expect(output.shared).toContain('function choose_many');
  });

  test('secret compiles', () => {
    const output = compile(`
      async fn main() {
        pw = await secret("Password:")
      }
    `);
    expect(output.shared).toContain('function secret');
  });
});

// ─── Integration: Full CLI compilation ───────────────────

describe('cli block - integration', () => {
  test('full example compiles', () => {
    const output = compile(`
      cli {
        name: "deploy"
        version: "1.0.0"
        description: "Deploy your app"

        fn deploy(target: String, --env: String = "staging", --port: Int = 3000, --verbose: Bool) {
          print(bold("Deploying ") + green(target) + " to " + env)
        }

        fn init(name: String?) {
          print("Initializing " + (name ?? "default"))
        }
      }
    `);
    expect(output.isCli).toBe(true);
    expect(output.cli).toContain('__cmd_deploy');
    expect(output.cli).toContain('__cmd_init');
    expect(output.cli).toContain('__cli_main');
    expect(output.cli).toContain('deploy');
    expect(output.cli).toContain('init');
  });

  test('cli with top-level type declarations', () => {
    const output = compile(`
      type Priority = Low | Medium | High

      cli {
        name: "todo"
        fn add(task: String) {
          print(task)
        }
      }
    `);
    expect(output.isCli).toBe(true);
    expect(output.cli).toContain('Low');
  });

  test('cli blocks do not produce server/client output', () => {
    const output = compile(`cli {
      name: "tool"
      fn run() { print("running") }
    }`);
    expect(output.server).toBe('');
    expect(output.client).toBe('');
  });
});
