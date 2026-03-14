<script setup>
const capstoneCode = `// CAPSTONE: Text Analyzer
// A complete CLI tool that analyzes text files
// Tests every concept from the tutorial

// ===== Types =====
type OutputFormat {
  Plain
  Tabular
  JsonFmt
}

// ===== Text Processing (Ch 3, 4) =====
fn clean_word(word) {
  word
    |> lower()
    |> trim()
    |> replace(",", "")
    |> replace(".", "")
    |> replace("!", "")
    |> replace("?", "")
    |> replace(";", "")
    |> replace(":", "")
    |> replace("'", "")
}

fn extract_words(text) {
  split(text, " ")
    |> map(fn(w) clean_word(w))
    |> filter(fn(w) len(w) > 0)
}

// ===== Word Frequency (Ch 3, 8) =====
fn count_frequencies(words) {
  var freq = {}
  for w in words {
    if freq[w] == undefined {
      freq[w] = 0
    }
    freq[w] += 1
  }
  freq
}

fn top_words(freq, n) {
  entries(freq)
    |> sorted(fn(e) 0 - e[1])
    |> take(n)
    |> map(fn(e) {
      { word: e[0], count: e[1] }
    })
}

// ===== Analysis (Ch 2, 7) =====
fn analyze(text) {
  lines = split(text, "\\n")
  all_words = extract_words(text)
  freq = count_frequencies(all_words)

  word_count = len(all_words)
  unique_count = len(keys(freq))

  longest = if word_count > 0 {
    all_words |> sorted(fn(w) 0 - len(w)) |> take(1)
  } else {
    [""]
  }

  avg_len = if word_count > 0 {
    total_chars = all_words |> map(fn(w) len(w)) |> sum()
    toFloat(total_chars) / toFloat(word_count)
  } else {
    0.0
  }

  common = top_words(freq, 10)

  {
    word_count: word_count,
    unique_words: unique_count,
    char_count: len(text),
    line_count: len(lines),
    avg_word_length: avg_len,
    longest_word: longest[0],
    most_common: common,
    reading_time_minutes: toFloat(word_count) / 200.0
  }
}

// ===== Formatting (Ch 4, 5, 6) =====
fn format_plain(r) {
  lines = [
    "Text Analysis Results",
    repeat("=", 35),
    "Words:           {r.word_count}",
    "Unique words:    {r.unique_words}",
    "Characters:      {r.char_count}",
    "Lines:           {r.line_count}",
    "Avg word length: {toInt(r.avg_word_length * 10) / 10}",
    "Longest word:    {r.longest_word}",
    "Reading time:    {toInt(r.reading_time_minutes * 10) / 10} min",
    "",
    "Top 10 Words:",
    repeat("-", 25)
  ]

  for entry in r.most_common {
    bar = repeat("#", entry.count)
    lines.push("  {padEnd(entry.word, 15)} {bar} ({entry.count})")
  }

  join(lines, "\\n")
}

fn format_table(r) {
  metric_label = "Metric"
  value_label = "Value"
  header = "| {padEnd(metric_label, 20)} | {padEnd(value_label, 15)} |"
  dash = "-"
  sep = "| {repeat(dash, 20)} | {repeat(dash, 15)} |"

  wl = "Words"
  uwl = "Unique Words"
  chl = "Characters"
  ll = "Lines"
  awl = "Avg Word Length"
  lwl = "Longest Word"
  rtl = "Reading Time"
  rt_num = toInt(r.reading_time_minutes * 10) / 10
  rt_val = "{rt_num} min"

  rows = [
    header,
    sep,
    "| {padEnd(wl, 20)} | {padEnd(toString(r.word_count), 15)} |",
    "| {padEnd(uwl, 20)} | {padEnd(toString(r.unique_words), 15)} |",
    "| {padEnd(chl, 20)} | {padEnd(toString(r.char_count), 15)} |",
    "| {padEnd(ll, 20)} | {padEnd(toString(r.line_count), 15)} |",
    "| {padEnd(awl, 20)} | {padEnd(toString(toInt(r.avg_word_length * 10) / 10), 15)} |",
    "| {padEnd(lwl, 20)} | {padEnd(r.longest_word, 15)} |",
    "| {padEnd(rtl, 20)} | {padEnd(rt_val, 15)} |"
  ]

  join(rows, "\\n")
}

fn format_json(r) {
  // Use JSON.stringify for proper JSON output
  obj = {
    word_count: r.word_count,
    unique_words: r.unique_words,
    char_count: r.char_count,
    line_count: r.line_count,
    avg_word_length: toInt(r.avg_word_length * 100) / 100,
    longest_word: r.longest_word,
    reading_time_minutes: toInt(r.reading_time_minutes * 10) / 10,
    most_common: r.most_common
  }
  JSON.stringify(obj, null, 2)
}

fn format_result(result, fmt) {
  match fmt {
    Plain => format_plain(result)
    Tabular => format_table(result)
    JsonFmt => format_json(result)
  }
}

// ===== Main (putting it all together) =====
sample_text = "Tova is a modern programming language designed for clarity and performance. Tova compiles to JavaScript but generates optimized code that beats Go on many benchmarks. The language features pattern matching, algebraic data types, and a powerful pipe operator. With Tova, you write clean, readable code and the compiler makes it fast. Tova supports async await for concurrent programming, Result and Option types for error handling, and a rich standard library for common tasks. Whether you are building scripts, data pipelines, or full stack web applications, Tova gives you the tools to be productive from day one."

result = analyze(sample_text)

// Show all three output formats
print(format_result(result, Plain))
print("")
print(format_result(result, Tabular))
print("")
print(format_result(result, JsonFmt))`
</script>

# Chapter 12: Capstone — Text Analyzer

This is it. Everything you've learned comes together in one real project: a **text analyzer** that processes text, computes statistics, and outputs results in multiple formats.

This chapter isn't about learning new concepts — it's about **applying** everything from Chapters 1-11 in a cohesive, real-world program.

## What We're Building

A text analysis tool that:
- Counts words, unique words, characters, and lines
- Finds the longest word and most common words
- Estimates reading time
- Outputs results in plain text, table, or JSON format
- Uses clean types, pattern matching, pipes, and error handling

## Architecture

Before writing code, let's plan the modules:

```
text-analyzer/
  types.tova        ← Data types (Ch 6)
  text.tova         ← Text processing (Ch 3, 4, 8)
  analysis.tova     ← Analysis logic (Ch 2, 7)
  formatter.tova    ← Output formatting (Ch 5)
  main.tova         ← Entry point
```

## Step 1: Define the Types

Every good project starts with types. What data are we working with?

```tova
// types.tova
type AnalysisResult {
  word_count: Int
  unique_words: Int
  char_count: Int
  line_count: Int
  avg_word_length: Float
  longest_word: String
  most_common: [{ word: String, count: Int }]
  reading_time_minutes: Float
}

type OutputFormat {
  Plain
  Tabular
  JsonFmt
}
```

The `AnalysisResult` record type holds everything we compute. `OutputFormat` is an ADT with three variants — one for each output style.

**Concepts used:** Record types, ADTs (Chapter 6)

## Step 2: Text Processing

Clean, split, and count words:

```tova
// text.tova
fn clean_word(word) {
  word
    |> lower()
    |> trim()
    |> replace(",", "")
    |> replace(".", "")
    |> replace("!", "")
    |> replace("?", "")
    |> replace(";", "")
    |> replace(":", "")
    |> replace("\"", "")
    |> replace("'", "")
}

fn extract_words(text) {
  split(text, " ")
    |> map(fn(w) clean_word(w))
    |> filter(fn(w) len(w) > 0)
}

fn count_frequencies(words) {
  var freq = {}
  for w in words {
    if freq[w] == undefined {
      freq[w] = 0
    }
    freq[w] += 1
  }
  freq
}

fn top_words(freq, n) {
  entries(freq)
    |> sorted(fn(e) 0 - e[1])
    |> take(n)
    |> map(fn(e) { word: e[0], count: e[1] })
}
```

Notice how `clean_word` uses a pipe chain, `extract_words` composes `map` and `filter`, and `top_words` is a pure data transformation pipeline.

**Concepts used:** Pipes (Chapter 8), Collections (Chapter 3), Strings (Chapter 4), Lambdas (Chapter 2)

## Step 3: Analysis Logic

Compute all the statistics:

```tova
// analysis.tova
fn analyze(text) {
  lines = split(text, "\\n")
  all_words = extract_words(text)
  freq = count_frequencies(all_words)

  word_count = len(all_words)
  unique_count = len(keys(freq))

  longest = if word_count > 0 {
    all_words |> sorted(fn(w) 0 - len(w)) |> take(1)
  } else {
    [""]
  }

  avg_len = if word_count > 0 {
    total_chars = all_words |> map(fn(w) len(w)) |> sum()
    toFloat(total_chars) / toFloat(word_count)
  } else {
    0.0
  }

  AnalysisResult(
    word_count: word_count,
    unique_words: unique_count,
    char_count: len(text),
    line_count: len(lines),
    avg_word_length: avg_len,
    longest_word: longest[0],
    most_common: top_words(freq, 10),
    reading_time_minutes: toFloat(word_count) / 200.0
  )
}
```

Everything is an expression. The `if` blocks compute values, pipes transform data, and the result is constructed from named fields.

**Concepts used:** Expressions (Chapter 1), Functions (Chapter 2), Pipes (Chapter 8)

## Step 4: Output Formatting

Use pattern matching to dispatch to the right formatter:

```tova
// formatter.tova
fn format_result(result, fmt) {
  match fmt {
    Plain => format_plain(result)
    Tabular => format_table(result)
    JsonFmt => format_json(result)
  }
}

fn format_plain(r) {
  lines = [
    "Text Analysis Results",
    repeat("=", 35),
    "Words:           {r.word_count}",
    "Unique words:    {r.unique_words}",
    "Characters:      {r.char_count}",
    "Lines:           {r.line_count}",
    "Avg word length: {toInt(r.avg_word_length * 10) / 10}",
    "Longest word:    {r.longest_word}",
    "Reading time:    {toInt(r.reading_time_minutes * 10) / 10} min",
    "",
    "Top 10 Words:",
    repeat("-", 25)
  ]

  for entry in r.most_common {
    bar = repeat("#", entry.count)
    lines.push("  {padEnd(entry.word, 15)} {bar} ({entry.count})")
  }

  join(lines, "\n")
}

fn format_table(r) {
  header = "| {padEnd(\"Metric\", 20)} | {padEnd(\"Value\", 15)} |"
  sep = "| {repeat(\"-\", 20)} | {repeat(\"-\", 15)} |"

  rows = [
    header, sep,
    "| {padEnd(\"Words\", 20)} | {padEnd(toString(r.word_count), 15)} |",
    "| {padEnd(\"Unique Words\", 20)} | {padEnd(toString(r.unique_words), 15)} |",
    "| {padEnd(\"Characters\", 20)} | {padEnd(toString(r.char_count), 15)} |",
    "| {padEnd(\"Lines\", 20)} | {padEnd(toString(r.line_count), 15)} |",
    "| {padEnd(\"Avg Word Length\", 20)} | {padEnd(toString(toInt(r.avg_word_length * 10) / 10), 15)} |",
    "| {padEnd(\"Longest Word\", 20)} | {padEnd(r.longest_word, 15)} |",
    "| {padEnd(\"Reading Time\", 20)} | {padEnd(\"{toInt(r.reading_time_minutes * 10) / 10} min\", 15)} |"
  ]

  join(rows, "\n")
}

fn format_json(r) {
  common_items = r.most_common
    |> map(fn(e) "    { \"word\": \"{e.word}\", \"count\": {e.count} }")
    |> join(",\n")

  lines = [
    "{",
    "  \"word_count\": {r.word_count},",
    "  \"unique_words\": {r.unique_words},",
    "  \"char_count\": {r.char_count},",
    "  \"line_count\": {r.line_count},",
    "  \"avg_word_length\": {toInt(r.avg_word_length * 100) / 100},",
    "  \"longest_word\": \"{r.longest_word}\",",
    "  \"reading_time_minutes\": {toInt(r.reading_time_minutes * 10) / 10},",
    "  \"most_common\": [",
    common_items,
    "  ]",
    "}"
  ]

  join(lines, "\n")
}
```

The top-level `format_result` dispatches on the ADT variant — clean, exhaustive, impossible to miss a case. Each formatter builds strings using interpolation and `join`.

**Concepts used:** Pattern matching (Chapter 5), ADTs (Chapter 6), Strings (Chapter 4), Pipes (Chapter 8)

## Step 5: Putting It Together

```tova
// main.tova
sample_text = "Tova is a modern programming language designed for clarity and performance. Tova compiles to JavaScript but generates optimized code that beats Go on many benchmarks. The language features pattern matching, algebraic data types, and a powerful pipe operator."

result = analyze(sample_text)

// Output in all formats
print(format_result(result, Plain))
print("")
print(format_result(result, Tabular))
```

<TryInPlayground :code="capstoneCode" label="Text Analyzer" />

## What This Project Demonstrates

| Concept | Where It's Used |
|---------|----------------|
| **Immutable values** (Ch 1) | Every intermediate value is immutable |
| **Expressions** (Ch 1) | `if` blocks compute avg_word_length |
| **Functions** (Ch 2) | Small, focused, composable functions |
| **Lambdas** (Ch 2) | Used in every `map`, `filter`, `sort_by` call |
| **Collections** (Ch 3) | Arrays, objects, iteration, aggregation |
| **Strings** (Ch 4) | Interpolation, `join`, `split`, `replace`, `pad_end` |
| **Pattern matching** (Ch 5) | `format_result` dispatches on OutputFormat variant |
| **Types** (Ch 6) | `AnalysisResult` record, `OutputFormat` ADT |
| **Error handling** (Ch 7) | Guards for empty text edge cases |
| **Pipes** (Ch 8) | `extract_words`, `top_words`, `format_json` |
| **Modules** (Ch 9) | Logical separation into types/text/analysis/formatter |

## Extensions

Now that you have the core project, here are ways to extend it:

### Add Error Handling with Result

```tova
fn analyze_safe(text) {
  if len(trim(text)) == 0 {
    Err("Cannot analyze empty text")
  } else {
    Ok(analyze(text))
  }
}
```

### Add More Statistics

- Sentence count (split on `.!?`)
- Paragraph count (split on double newlines)
- Vocabulary richness (unique words / total words)
- Flesch-Kincaid readability score
- Syllable counting

### Add File I/O

```tova
async fn analyze_file(path) {
  content = await read_file(path)
  match content {
    Ok(text) => Ok(analyze(text))
    Err(msg) => Err("Could not read {path}: {msg}")
  }
}
```

### Make It a CLI Tool

```tova
cli {
  name: "textstat"
  version: "1.0.0"
  description: "Analyze text files"

  fn analyze(file: String, --format: String = "plain", --top: Int = 10) {
    // Read file, analyze, format output
  }
}
```

## Final Exercises

**Exercise 12.1:** Add a `Markdown` variant to `OutputFormat` that outputs the analysis as a Markdown document with headers, a table for metrics, and a code block for the word frequency chart.

**Exercise 12.2:** Add a `compare(text_a, text_b)` function that analyzes both texts and produces a comparison report showing which text is longer, more varied, more complex, etc.

**Exercise 12.3:** Add a `readability_score(text)` function that estimates reading difficulty. Use average sentence length and average word length as factors.

## What's Next?

Congratulations — you've mastered the Tova language. You can:

- Write clean, expression-based code
- Build composable functions and closures
- Process collections with pipes and transformations
- Model domains with types and pattern matching
- Handle errors explicitly with Result and Option
- Organize code into modules
- Work with async operations
- Optimize with @fast and @wasm

From here, explore:
- [Full-Stack Architecture](/fullstack/architecture) — Build web applications
- [Server Guide](/server/routes) — Build APIs and servers
- [Reactive UI](/reactivity/signals) — Build interactive interfaces
- [Examples](/examples/) — Full applications to study
- [Standard Library](/stdlib/) — The complete stdlib reference

The best way to solidify your skills is to **build something real**. Pick a project that excites you and start writing Tova.

---

[← Previous: Performance Secrets](./performance) | [Next: Functional Programming →](./functional-programming)
