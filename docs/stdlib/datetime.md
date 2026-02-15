# Date & Time

Tova provides functions for working with dates and times. All functions accept both `Date` objects and Unix timestamps (milliseconds).

## Current Time

### now

```tova
now() -> Int
```

Returns the current timestamp in milliseconds since the Unix epoch.

```tova
start = now()
// ... do work ...
elapsed = now() - start
print("Took {elapsed}ms")
```

### now_iso

```tova
now_iso() -> String
```

Returns the current date and time as an ISO 8601 string.

```tova
now_iso()
// "2024-01-15T10:30:00.000Z"

log_entry = { timestamp: now_iso(), message: "Server started" }
```

---

## Parsing & Creating

### date_parse

```tova
date_parse(s) -> Result<Date, String>
```

Parses a date string into a `Date` object. Returns `Ok(Date)` on success or `Err` for invalid input.

```tova
date_parse("2024-01-15")
// Ok(Date)

date_parse("2024-06-15T12:00:00Z")
// Ok(Date)

date_parse("not-a-date")
// Err("Invalid date: not-a-date")
```

```tova
// Safe parsing with match
match date_parse(user_input) {
  Ok(d) => process_date(d)
  Err(msg) => print("Bad date: {msg}")
}
```

### date_from

```tova
date_from(parts) -> Date
```

Creates a `Date` from a parts object. Fields: `year`, `month` (1-indexed), `day`, `hour`, `minute`, `second`.

```tova
date_from({ year: 2024, month: 6, day: 15 })
// Date representing June 15, 2024

date_from({ year: 2024, month: 1, day: 1, hour: 14, minute: 30 })
// Date representing Jan 1, 2024 at 2:30 PM
```

---

## Formatting

### date_format

```tova
date_format(d, fmt) -> String
```

Formats a date using a preset or custom token format. Accepts a `Date` or a Unix timestamp.

**Presets:** `"iso"`, `"date"`, `"time"`, `"datetime"`

**Custom tokens:** `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`

```tova
d = date_from({ year: 2024, month: 6, day: 15 })

date_format(d, "iso")              // "2024-06-15T..."
date_format(d, "date")             // "2024-06-15"
date_format(d, "YYYY-MM-DD")      // "2024-06-15"
date_format(d, "DD/MM/YYYY")      // "15/06/2024"
date_format(d, "YYYY")            // "2024"
```

```tova
// Works with timestamps too
date_format(now(), "date")
```

---

## Arithmetic

### date_add

```tova
date_add(d, amount, unit) -> Date
```

Returns a new date with the given amount added. Units: `"years"`, `"months"`, `"days"`, `"hours"`, `"minutes"`, `"seconds"`.

```tova
d = date_from({ year: 2024, month: 1, day: 1 })

date_add(d, 10, "days")       // Jan 11, 2024
date_add(d, 2, "months")      // March 1, 2024
date_add(d, 1, "years")       // Jan 1, 2025
date_add(d, -7, "days")       // Dec 25, 2023
```

### date_diff

```tova
date_diff(d1, d2, unit) -> Int
```

Returns the difference between two dates in the specified unit. Result is `d2 - d1`.

```tova
d1 = date_from({ year: 2024, month: 1, day: 1 })
d2 = date_from({ year: 2024, month: 1, day: 11 })

date_diff(d1, d2, "days")         // 10
date_diff(d1, d2, "hours")        // 240

d3 = date_from({ year: 2024, month: 6, day: 1 })
date_diff(d1, d3, "months")       // 5
date_diff(d1, d3, "years")        // 0
```

---

## Extracting Parts

### date_part

```tova
date_part(d, part) -> Int
```

Extracts a component from a date. Parts: `"year"`, `"month"` (1-indexed), `"day"`, `"hour"`, `"minute"`, `"second"`, `"weekday"` (0=Sunday).

```tova
d = date_from({ year: 2024, month: 6, day: 15, hour: 14 })

date_part(d, "year")       // 2024
date_part(d, "month")      // 6
date_part(d, "day")        // 15
date_part(d, "hour")       // 14
date_part(d, "weekday")    // 6 (Saturday)
```

---

## Human-Readable

### time_ago

```tova
time_ago(d) -> String
```

Returns a human-readable relative time string. Accepts a `Date` or a Unix timestamp.

```tova
time_ago(date_add(now(), -30, "seconds") |> date_from_ts())
// "30 seconds ago"

time_ago(date_add(date_from({ year: 2024, month: 1, day: 1 }), -5, "minutes"))
// "5 minutes ago"
```

```tova
// Common patterns
time_ago(post.created_at)      // "3 hours ago"
time_ago(user.last_seen)       // "2 days ago"
time_ago(event.date)           // "3 months ago"
```

---

## Pipeline Examples

```tova
// Parse and format a date
"2024-06-15"
  |> date_parse()
  |> fn(r) r.unwrap()
  |> date_format("DD/MM/YYYY")
// "15/06/2024"

// Calculate deadline
deadline = date_from({ year: 2024, month: 1, day: 1 })
  |> date_add(30, "days")

days_left = date_diff(now(), deadline, "days")
print("{days_left} days until deadline")

// Format timestamps for display
posts
  |> map(fn(p) merge(p, { when: time_ago(p.created_at) }))
// [{ title: "...", when: "3 hours ago" }, ...]
```
