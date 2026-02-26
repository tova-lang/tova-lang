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
fs.ls(dir?) -> [String]
```

Lists entries in a directory. Defaults to the current directory.

```tova
files = fs.ls("src/")
// ["main.tova", "utils.tova", "lib/"]
```

### fs.mkdir

```tova
fs.mkdir(path) -> Nil
```

Creates a directory (and parent directories if needed).

```tova
fs.mkdir("output/reports")
```

### fs.rm

```tova
fs.rm(path) -> Nil
```

Removes a file or directory.

### fs.cp

```tova
fs.cp(src, dest) -> Nil
```

Copies a file or directory.

```tova
fs.cp("template.tova", "new-project/main.tova")
```

### fs.mv

```tova
fs.mv(src, dest) -> Nil
```

Moves or renames a file or directory.

### fs.read_text

```tova
fs.read_text(path) -> String
```

Reads the entire contents of a file as a string.

```tova
content = fs.read_text("README.md")
print(len(content))
```

### fs.write_text

```tova
fs.write_text(path, content) -> Nil
```

Writes a string to a file, creating it if it does not exist.

```tova
fs.write_text("output.txt", "Hello, World!")
```

### fs.read_bytes

```tova
fs.read_bytes(path) -> Buffer
```

Reads the entire contents of a file as binary data.

```tova
data = fs.read_bytes("image.png")
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
fs.file_stat(path) -> Object
```

Returns file metadata (size, modified time, etc.).

### fs.file_size

```tova
fs.file_size(path) -> Int
```

Returns the file size in bytes.

```tova
size = fs.file_size("data.csv")
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
path_resolve(...parts) -> String
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
symlink(target, link_path) -> Nil
```

Creates a symbolic link.

### readlink

```tova
readlink(path) -> String
```

Returns the target of a symbolic link.

### is_symlink

```tova
is_symlink(path) -> Bool
```

Returns `true` if the path is a symbolic link.

---

## Shell Commands

### sh

```tova
sh(cmd) -> String
```

Runs a command through the system shell and returns the stdout output.

```tova
output = sh("ls -la")
version = sh("git --version")
```

::: warning
`sh` passes the command through a shell. Do not include untrusted user input in the command string. Use `exec` instead for safe command execution with separate arguments.
:::

### exec

```tova
exec(cmd, args) -> String
```

Runs a command with an explicit argument list. Arguments are passed directly to the process without shell interpretation, preventing injection vulnerabilities.

```tova
output = exec("git", ["log", "--oneline", "-5"])
result = exec("node", ["--version"])
```

### spawn

```tova
spawn(cmd, args) -> Process
```

Spawns an async child process. Returns a `Process` object for streaming I/O.

```tova
proc = spawn("python3", ["server.py"])
await proc.wait()
```

---

## Environment and CLI

::: tip Building a CLI tool?
For structured CLI tools with subcommands, typed arguments, and auto-generated help, use the [`cli {}` block](/fullstack/cli-block) instead of manual argument parsing. For terminal colors, tables, progress bars, and interactive prompts, see [Terminal & CLI](/stdlib/terminal).
:::

### env

```tova
env(key?) -> String | Object
```

Returns an environment variable value, or all environment variables if no key is given.

```tova
home = env("HOME")
all_vars = env()
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
parse_args() -> Object
```

Parses command-line arguments into a structured object with flags, options, and positional arguments.

```tova
opts = parse_args()
// tova run build.tova --output dist --verbose
// { output: "dist", verbose: true, _: ["build.tova"] }
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
chdir(dir) -> Nil
```

Changes the current working directory.

```tova
chdir("/tmp")
print(cwd())    // "/tmp"
```

### script_path

```tova
script_path() -> String
```

Returns the absolute path of the currently running script.

### script_dir

```tova
script_dir() -> String
```

Returns the directory containing the currently running script.

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
port = env("PORT") ?? "3000" |> to_int()
debug = env("DEBUG") == "true"
db_url = env("DATABASE_URL") ?? "sqlite:./dev.db"
```
