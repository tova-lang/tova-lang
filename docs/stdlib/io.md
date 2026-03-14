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
fs.isFile(path) -> Bool
```

Returns `true` if the path is a regular file.

### fs.is_dir

```tova
fs.isDir(path) -> Bool
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
fs.readText(path, encoding?) -> Result<String>
```

Reads the entire contents of a file as a string. Returns `Ok(content)` on success, `Err(message)` on failure.

```tova
content = fs.readText("README.md").unwrap()
print(len(content))

// With error handling
match fs.readText("README.md") {
  Ok(text) => print(len(text))
  Err(msg) => print("Could not read file: {msg}")
}
```

### fs.write_text

```tova
fs.writeText(path, content, opts?) -> Result<String>
```

Writes a string to a file, creating it if it does not exist. Returns `Ok(path)` on success, `Err(message)` on failure. Supports `opts.append` for append mode.

```tova
fs.writeText("output.txt", "Hello, World!")

// Append to a file
fs.writeText("log.txt", "New entry\n", append: true)
```

### fs.read_bytes

```tova
fs.readBytes(path) -> Result<Buffer>
```

Reads the entire contents of a file as binary data. Returns `Ok(buffer)` on success, `Err(message)` on failure.

```tova
data = fs.readBytes("image.png").unwrap()
print("Read {len(data)} bytes")
```

### fs.glob_files

```tova
fs.globFiles(pattern) -> [String]
```

Returns file paths matching a glob pattern.

```tova
tova_files = fs.globFiles("src/**/*.tova")
test_files = fs.globFiles("tests/*.tova")
```

### fs.file_stat

```tova
fs.fileStat(path) -> Result<Object>
```

Returns file metadata. Returns `Ok({size, mode, mtime, atime, isDir, isFile, isSymlink})` on success, `Err(message)` on failure.

### fs.file_size

```tova
fs.fileSize(path) -> Result<Int>
```

Returns the file size in bytes. Returns `Ok(size)` on success, `Err(message)` on failure.

```tova
size = fs.fileSize("data.csv").unwrap()
print("File is {size} bytes")
```

---

## Path Utilities

### path_join

```tova
pathJoin(...parts) -> String
```

Joins path segments with the platform separator.

```tova
pathJoin("src", "utils", "helpers.tova")
// "src/utils/helpers.tova"
```

### path_dirname

```tova
pathDirname(path) -> String
```

Returns the directory portion of a path.

```tova
pathDirname("/home/user/file.tova")    // "/home/user"
```

### path_basename

```tova
pathBasename(path) -> String
```

Returns the file name portion of a path.

```tova
pathBasename("/home/user/file.tova")   // "file.tova"
```

### path_resolve

```tova
pathResolve(path) -> String
```

Resolves a path to an absolute path.

### path_ext

```tova
pathExt(path) -> String
```

Returns the file extension.

```tova
pathExt("data.csv")        // ".csv"
pathExt("archive.tar.gz")  // ".gz"
```

### path_relative

```tova
pathRelative(from, to) -> String
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
isSymlink(path) -> Bool
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
setEnv(key, value) -> Nil
```

Sets an environment variable for the current process.

```tova
setEnv("NODE_ENV", "production")
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
parseArgs(argv) -> {flags: Object, positional: [String]}
```

Parses command-line arguments into a structured object with `flags` (named options) and `positional` (positional arguments). Handles `--key value`, `--key=value`, `--flag` (boolean), and `-abc` (short flags).

```tova
opts = parseArgs(args())
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
scriptPath() -> String | Nil
```

Returns the absolute path of the currently running script, or `null` if not available.

### script_dir

```tova
scriptDir() -> String | Nil
```

Returns the directory containing the currently running script, or `null` if not available.

### on_signal

```tova
onSignal(signal, handler) -> Nil
```

Registers a handler function for a process signal (e.g., `"SIGINT"`, `"SIGTERM"`).

```tova
onSignal("SIGINT", fn() {
  print("Caught interrupt, cleaning up...")
  cleanup()
  exit(0)
})
```

---

## Standard Input

### read_stdin

```tova
readStdin() -> String
```

Reads all input from stdin.

```tova
// Pipe data: echo "hello" | tova run script.tova
input = readStdin()
print("Got: {input}")
```

### read_lines

```tova
readLines() -> [String]
```

Reads stdin and splits into lines.

```tova
for line in readLines() {
  process(line)
}
```

---

## Data Formats

The `read()` and `write()` functions support these formats via file extension:

| Extension | Format | Read | Write | Notes |
|-----------|--------|------|-------|-------|
| `.csv` | CSV | Yes | Yes | Auto-detects delimiter |
| `.tsv` | TSV | Yes | Yes | Tab-delimited |
| `.json` | JSON | Yes | Yes | Array of objects |
| `.jsonl` | JSON Lines | Yes | Yes | One object per line |
| `.parquet` | Apache Parquet | Yes | Yes | Via `parquet-wasm` (lazy-loaded) |
| `.xlsx` | Excel | Yes | Yes | Via `exceljs` (lazy-loaded) |

### Parquet

```tova
data = read("warehouse.parquet")
write(table, "output.parquet")
write(table, "output.parquet", compression: "gzip")   // default: snappy
```

Compression options: `"snappy"` (default), `"gzip"`, `"none"`.

### Excel

```tova
data = read("report.xlsx")
data = read("report.xlsx", sheet: "Q4 Sales")     // by name
data = read("report.xlsx", sheet: 1)               // by index (1-based)
write(table, "output.xlsx")
write(table, "output.xlsx", sheet: "Summary")
```

### SQLite

```tova
db = sqlite("app.db")
db = sqlite(":memory:")

// Query returns a Table
users = db.query("SELECT * FROM users WHERE active = 1")
user = db.query("SELECT * FROM users WHERE id = ?", [42])

// Run statements
db.exec("CREATE TABLE logs (id INTEGER PRIMARY KEY, msg TEXT)")
db.exec("INSERT INTO logs (msg) VALUES (?)", ["hello"])

// Write a Table to a database table
write(sales, db, "sales")
write(sales, db, "sales", append: true)

db.close()
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
files = fs.globFiles(pathJoin(input_dir, "*.csv"))

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
port = env("PORT", "3000") |> toInt()
debug = env("DEBUG") == "true"
db_url = env("DATABASE_URL", "sqlite:./dev.db")
```
