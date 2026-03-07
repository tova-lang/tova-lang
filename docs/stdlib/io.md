# Scripting I/O

Tova provides comprehensive I/O functions for scripting, file system operations, shell commands, and environment access. These functions are available in `tova run` scripts and server blocks.

For reading and writing data files (CSV, JSON, etc.), see the [I/O guide](../guide/io.md).

---

## Filesystem

The `fs` namespace provides file and directory operations.

### fs.exists

```tova
fs.exists(path) -> Bool
```

Returns `true` if the file or directory exists.

```tova
if fs.exists("config.json") {
  config = read("config.json")
}
```

### fs.is_file

```tova
fs.is_file(path) -> Bool
```

Returns `true` if the path is a regular file.

### fs.is_dir

```tova
fs.is_dir(path) -> Bool
```

Returns `true` if the path is a directory.

### fs.ls

```tova
fs.ls(dir?, opts?) -> [String]
```

Lists entries in a directory. Defaults to the current directory. Pass `opts.full` to get full paths.

```tova
files = fs.ls("src/")
// ["main.tova", "utils.tova", "lib/"]

// Full paths
full = fs.ls("src/", full: true)
// ["src/main.tova", "src/utils.tova", "src/lib/"]
```

### fs.mkdir

```tova
fs.mkdir(path) -> Result<String>
```

Creates a directory (and parent directories if needed). Returns `Ok(path)` on success, `Err(message)` on failure.

```tova
fs.mkdir("output/reports")
```

### fs.rm

```tova
fs.rm(path, opts?) -> Result<String>
```

Removes a file or directory. Returns `Ok(path)` on success, `Err(message)` on failure. Supports `opts.recursive` and `opts.force`.

### fs.cp

```tova
fs.cp(src, dest, opts?) -> Result<String>
```

Copies a file or directory. Returns `Ok(dest)` on success, `Err(message)` on failure. Supports `opts.recursive` for directory copies.

```tova
fs.cp("template.tova", "new-project/main.tova")
```

### fs.mv

```tova
fs.mv(src, dest) -> Result<String>
```

Moves or renames a file or directory. Returns `Ok(dest)` on success, `Err(message)` on failure.

### fs.read_text

```tova
fs.read_text(path, encoding?) -> Result<String>
```

Reads the entire contents of a file as a string. Returns `Ok(content)` on success, `Err(message)` on failure.

```tova
content = fs.read_text("README.md").unwrap()
print(len(content))

// With error handling
match fs.read_text("README.md") {
  Ok(text) => print(len(text))
  Err(msg) => print("Could not read file: {msg}")
}
```

### fs.write_text

```tova
fs.write_text(path, content, opts?) -> Result<String>
```

Writes a string to a file, creating it if it does not exist. Returns `Ok(path)` on success, `Err(message)` on failure. Supports `opts.append` for append mode.

```tova
fs.write_text("output.txt", "Hello, World!")

// Append to a file
fs.write_text("log.txt", "New entry\n", append: true)
```

### fs.read_bytes

```tova
fs.read_bytes(path) -> Result<Buffer>
```

Reads the entire contents of a file as binary data. Returns `Ok(buffer)` on success, `Err(message)` on failure.

```tova
data = fs.read_bytes("image.png").unwrap()
print("Read {len(data)} bytes")
```

### fs.glob_files

```tova
fs.glob_files(pattern) -> [String]
```

Returns file paths matching a glob pattern.

```tova
tova_files = fs.glob_files("src/**/*.tova")
test_files = fs.glob_files("tests/*.tova")
```

### fs.file_stat

```tova
fs.file_stat(path) -> Result<Object>
```

Returns file metadata. Returns `Ok({size, mode, mtime, atime, isDir, isFile, isSymlink})` on success, `Err(message)` on failure.

### fs.file_size

```tova
fs.file_size(path) -> Result<Int>
```

Returns the file size in bytes. Returns `Ok(size)` on success, `Err(message)` on failure.

```tova
size = fs.file_size("data.csv").unwrap()
print("File is {size} bytes")
```

---

## Path Utilities

### path_join

```tova
path_join(...parts) -> String
```

Joins path segments with the platform separator.

```tova
path_join("src", "utils", "helpers.tova")
// "src/utils/helpers.tova"
```

### path_dirname

```tova
path_dirname(path) -> String
```

Returns the directory portion of a path.

```tova
path_dirname("/home/user/file.tova")    // "/home/user"
```

### path_basename

```tova
path_basename(path) -> String
```

Returns the file name portion of a path.

```tova
path_basename("/home/user/file.tova")   // "file.tova"
```

### path_resolve

```tova
path_resolve(path) -> String
```

Resolves a path to an absolute path.

### path_ext

```tova
path_ext(path) -> String
```

Returns the file extension.

```tova
path_ext("data.csv")        // ".csv"
path_ext("archive.tar.gz")  // ".gz"
```

### path_relative

```tova
path_relative(from, to) -> String
```

Returns the relative path from `from` to `to`.

---

## Symlinks

### symlink

```tova
symlink(target, link_path) -> Result<Nil>
```

Creates a symbolic link. Returns `Ok(null)` on success, `Err(message)` on failure.

### readlink

```tova
readlink(path) -> Result<String>
```

Returns the target of a symbolic link. Returns `Ok(target)` on success, `Err(message)` on failure.

### is_symlink

```tova
is_symlink(path) -> Bool
```

Returns `true` if the path is a symbolic link.

---

## Shell Commands

### sh

```tova
sh(cmd, opts?) -> Result<{stdout: String, stderr: String, exitCode: Int}>
```

Runs a command through the system shell. Returns `Ok({stdout, stderr, exitCode})` on success, `Err(message)` on failure. Supports `opts.cwd`, `opts.env`, and `opts.timeout`.

```tova
match sh("ls -la") {
  Ok(result) => print(result.stdout)
  Err(msg) => print("Command failed: {msg}")
}

version = sh("git --version").unwrap().stdout
```

::: warning
`sh` passes the command through a shell. Do not include untrusted user input in the command string. Use `exec` instead for safe command execution with separate arguments.
:::

### exec

```tova
exec(cmd, args?, opts?) -> Result<{stdout: String, stderr: String, exitCode: Int}>
```

Runs a command with an explicit argument list. Arguments are passed directly to the process without shell interpretation, preventing injection vulnerabilities. Returns `Ok({stdout, stderr, exitCode})` on success, `Err(message)` on failure. Supports `opts.cwd`, `opts.env`, and `opts.timeout`.

```tova
match exec("git", ["log", "--oneline", "-5"]) {
  Ok(r) => print(r.stdout)
  Err(msg) => print("Command failed: {msg}")
}

version = exec("node", ["--version"]).unwrap().stdout
```

### spawn

```tova
spawn(cmd, args?, opts?) -> Promise<Result<{stdout: String, stderr: String, exitCode: Int}>>
```

Spawns an async child process. Returns a `Promise` that resolves to `Ok({stdout, stderr, exitCode})` on success, `Err(message)` on failure. Supports `opts.cwd`, `opts.env`, and `opts.shell`.

```tova
result = await spawn("python3", ["server.py"])
match result {
  Ok(r) => print("Exited with code {r.exitCode}")
  Err(msg) => print("Failed to spawn: {msg}")
}
```

---

## Environment and CLI

::: tip Building a CLI tool?
For structured CLI tools with subcommands, typed arguments, and auto-generated help, use the [`cli {}` block](/fullstack/cli-block) instead of manual argument parsing. For terminal colors, tables, progress bars, and interactive prompts, see [Terminal & CLI](/stdlib/terminal).
:::

### env

```tova
env(key?, fallback?) -> String | Object | Nil
```

Returns an environment variable value, or all environment variables if no key is given. Returns `null` if the key is not set and no fallback is provided.

```tova
home = env("HOME")
all_vars = env()

// With fallback value
port = env("PORT", "3000")
```

### set_env

```tova
set_env(key, value) -> Nil
```

Sets an environment variable for the current process.

```tova
set_env("NODE_ENV", "production")
```

### args

```tova
args() -> [String]
```

Returns command-line arguments passed to the script.

```tova
arguments = args()
if len(arguments) < 2 {
  print("Usage: tova run script.tova <input>")
  exit(1)
}
```

### parse_args

```tova
parse_args(argv) -> {flags: Object, positional: [String]}
```

Parses command-line arguments into a structured object with `flags` (named options) and `positional` (positional arguments). Handles `--key value`, `--key=value`, `--flag` (boolean), and `-abc` (short flags).

```tova
opts = parse_args(args())
// tova run build.tova --output dist --verbose
// { flags: { output: "dist", verbose: true }, positional: ["build.tova"] }

output_dir = opts.flags.output ?? "build"
```

### exit

```tova
exit(code?) -> Never
```

Exits the process with an optional exit code (default: 0).

```tova
if error_occurred {
  print("Fatal error")
  exit(1)
}
```

### cwd

```tova
cwd() -> String
```

Returns the current working directory.

```tova
print("Working in: {cwd()}")
```

### chdir

```tova
chdir(dir) -> Result<String>
```

Changes the current working directory. Returns `Ok(dir)` on success, `Err(message)` on failure.

```tova
chdir("/tmp")
print(cwd())    // "/tmp"

// With error handling
match chdir("/nonexistent") {
  Ok(_) => print("Changed directory")
  Err(msg) => print("Could not change directory: {msg}")
}
```

### script_path

```tova
script_path() -> String | Nil
```

Returns the absolute path of the currently running script, or `null` if not available.

### script_dir

```tova
script_dir() -> String | Nil
```

Returns the directory containing the currently running script, or `null` if not available.

### on_signal

```tova
on_signal(signal, handler) -> Nil
```

Registers a handler function for a process signal (e.g., `"SIGINT"`, `"SIGTERM"`).

```tova
on_signal("SIGINT", fn() {
  print("Caught interrupt, cleaning up...")
  cleanup()
  exit(0)
})
```

---

## Standard Input

### read_stdin

```tova
read_stdin() -> String
```

Reads all input from stdin.

```tova
// Pipe data: echo "hello" | tova run script.tova
input = read_stdin()
print("Got: {input}")
```

### read_lines

```tova
read_lines() -> [String]
```

Reads stdin and splits into lines.

```tova
for line in read_lines() {
  process(line)
}
```

---

## Examples

### File Processing Script

```tova
#!/usr/bin/env tova

arguments = args()
guard len(arguments) >= 1 else {
  print("Usage: process.tova <input-dir>")
  exit(1)
}

input_dir = arguments[0]
files = fs.glob_files(path_join(input_dir, "*.csv"))

for file in files {
  data = read(file)
  result = data |> where(.valid) |> sorted(fn(r) r.date)
  output = replace(file, ".csv", "_clean.csv")
  result |> write(output)
  print("Processed {file} -> {output}")
}
```

### Environment Configuration

```tova
port = env("PORT", "3000") |> to_int()
debug = env("DEBUG") == "true"
db_url = env("DATABASE_URL", "sqlite:./dev.db")
```
