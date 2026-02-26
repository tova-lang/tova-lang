# Terminal & CLI

Tova provides built-in functions for terminal output formatting, colors, rich display, and interactive prompts. These are available in any Tova program and are especially useful inside [`cli {}` blocks](/fullstack/cli-block).

All color and formatting functions respect the `NO_COLOR` environment variable and degrade gracefully in non-TTY environments.

---

## Colors

### color

```tova
color(text, name) -> String
```

Wraps text in an ANSI color code. Supported color names: `"red"`, `"green"`, `"yellow"`, `"blue"`, `"magenta"`, `"cyan"`, `"white"`, `"gray"`.

```tova
print(color("Error!", "red"))
print(color("All good", "green"))
```

### Color Shortcuts

Convenience functions that call `color()` with the appropriate name:

```tova
green(text) -> String
red(text) -> String
yellow(text) -> String
blue(text) -> String
cyan(text) -> String
magenta(text) -> String
gray(text) -> String
```

```tova
print(green("Success"))
print(red("Failed"))
print(yellow("Warning"))
print(blue("Info"))
```

---

## Text Formatting

### bold

```tova
bold(text) -> String
```

Makes text bold.

```tova
print(bold("Important"))
```

### dim

```tova
dim(text) -> String
```

Makes text dimmed (faint).

```tova
print(dim("Less important"))
```

### underline

```tova
underline(text) -> String
```

Underlines text.

```tova
print(underline("Click here"))
```

### strikethrough

```tova
strikethrough(text) -> String
```

Strikes through text.

```tova
print(strikethrough("Removed"))
```

---

## Rich Output

### table

```tova
table(data, opts?) -> Nil
```

Prints a formatted table with auto-sized columns and bold headers. `data` is an array of objects. Optionally pass `headers:` to specify which fields to display and in what order.

```tova
table([
  {name: "Alice", role: "Admin", active: true},
  {name: "Bob", role: "User", active: false}
])
```

Output:

```
 name  | role  | active
-------+-------+-------
 Alice | Admin | true
 Bob   | User  | false
```

With custom headers:

```tova
table(data, headers: ["name", "role"])
```

### panel

```tova
panel(title, content) -> Nil
```

Draws a Unicode box around content with a bold title.

```tova
panel("Server Status", "Uptime: 99.9%\nRequests: 12,345")
```

Output:

```
┌─ Server Status ──────────┐
│ Uptime: 99.9%            │
│ Requests: 12,345         │
└──────────────────────────┘
```

### progress

```tova
progress(items, opts?) -> Iterable
```

Wraps an iterable to display a progress bar on stderr. Returns an iterator that yields the same items while updating the progress display.

Options:
- `label` — text shown before the bar
- `width` — bar width in characters (default: 30)
- `total` — total count (auto-detected from array length)

```tova
for item in progress(items, label: "Processing") {
  process(item)
}
```

Output (updates in-place):

```
Processing [████████░░░░░░░░░░░░░░░░░░░░░░] 25% 250/1000
```

### spin

```tova
async spin(label, fn) -> T
```

Shows a braille spinner animation while an async function executes. Displays a checkmark on success or a cross on error.

```tova
result = await spin("Deploying", async fn() {
  await deploy_to_production()
})
```

Output while running:

```
⠸ Deploying
```

On success:

```
✔ Deploying
```

On error:

```
✘ Deploying
```

---

## Interactive Prompts

All prompt functions are `async` and use Node.js readline. They work in TTY environments.

### ask

```tova
async ask(prompt, opts?) -> String
```

Prompts for text input. Returns the user's input or the default value if the user presses Enter without typing.

Options:
- `default` — default value shown in parentheses

```tova
name = await ask("Project name:", default: "my-app")
// Prompt: Project name: (my-app)
```

### confirm

```tova
async confirm(prompt, opts?) -> Bool
```

Prompts for a yes/no answer. Returns `true` for "y"/"yes", `false` for "n"/"no". The hint shows `[Y/n]` or `[y/N]` based on the default.

Options:
- `default` — default boolean value (default: `true`)

```tova
ok = await confirm("Continue?")
// Prompt: Continue? [Y/n]

danger = await confirm("Delete everything?", default: false)
// Prompt: Delete everything? [y/N]
```

### choose

```tova
async choose(prompt, options) -> String
```

Displays a numbered list and prompts the user to pick one. Returns the selected option value.

```tova
lang = await choose("Pick a language:", ["Tova", "Python", "Rust"])
// Pick a language:
//   1. Tova
//   2. Python
//   3. Rust
// Select [1-3]: _
```

### choose_many

```tova
async choose_many(prompt, options) -> [String]
```

Like `choose`, but accepts comma-separated selections for multi-select.

```tova
features = await choose_many("Enable features:", ["auth", "logging", "metrics"])
// Enable features:
//   1. auth
//   2. logging
//   3. metrics
// Select (comma-separated): 1,3
// => ["auth", "metrics"]
```

### secret

```tova
async secret(prompt) -> String
```

Prompts for hidden input. Characters are masked with `*` in TTY mode.

```tova
password = await secret("Password:")
// Password: ****
```

---

## Examples

### Colorful CLI Output

```tova
cli {
  name: "deploy"

  fn deploy(target: String, --env: String = "staging") {
    print(bold("Deploying ") + green(target) + " to " + cyan(env))
    print(dim("This may take a moment..."))
  }
}
```

### Interactive Setup Wizard

```tova
cli {
  name: "create-app"

  async fn init() {
    name = await ask("Project name:", default: "my-app")
    template = await choose("Template:", ["fullstack", "api", "script"])
    db = await confirm("Include database?")

    if db {
      db_pass = await secret("Database password:")
    }

    print(panel("Summary", "Name: {name}\nTemplate: {template}\nDatabase: {db}"))

    ok = await confirm("Create project?")
    if ok {
      await spin("Creating project", async fn() {
        // scaffold project...
      })
      print(green("Done! Run 'cd {name} && tova dev' to start."))
    }
  }
}
```

### Progress Bar for Batch Processing

```tova
files = fs.glob_files("data/*.csv")

for file in progress(files, label: "Processing") {
  data = read(file)
  result = data |> where(.valid)
  write(result, replace(file, ".csv", "_clean.csv"))
}
```
