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
nowIso() -> String
```

Returns the current date and time as an ISO 8601 string.

```tova
nowIso()
// "2024-01-15T10:30:00.000Z"

log_entry = { timestamp: nowIso(), message: "Server started" }
```

---

## Parsing & Creating

### date_parse

```tova
dateParse(s) -> Result<Date, String>
```

Parses a date string into a `Date` object. Returns `Ok(Date)` on success or `Err` for invalid input.

```tova
dateParse("2024-01-15")
// Ok(Date)

dateParse("2024-06-15T12:00:00Z")
// Ok(Date)

dateParse("not-a-date")
// Err("Invalid date: not-a-date")
```

```tova
// Safe parsing with match
match dateParse(user_input) {
  Ok(d) => process_date(d)
  Err(msg) => print("Bad date: {msg}")
}
```

### date_from

```tova
dateFrom(parts) -> Date
```

Creates a `Date` from a parts object. Fields: `year`, `month` (1-indexed), `day`, `hour`, `minute`, `second`.

```tova
dateFrom({ year: 2024, month: 6, day: 15 })
// Date representing June 15, 2024

dateFrom({ year: 2024, month: 1, day: 1, hour: 14, minute: 30 })
// Date representing Jan 1, 2024 at 2:30 PM
```

---

## Formatting

### date_format

```tova
dateFormat(d, fmt) -> String
```

Formats a date using a preset or custom token format. Accepts a `Date` or a Unix timestamp.

**Presets:** `"iso"`, `"date"`, `"time"`, `"datetime"`

**Custom tokens:** `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`

```tova
d = dateFrom({ year: 2024, month: 6, day: 15 })

dateFormat(d, "iso")              // "2024-06-15T..."
dateFormat(d, "date")             // "2024-06-15"
dateFormat(d, "YYYY-MM-DD")      // "2024-06-15"
dateFormat(d, "DD/MM/YYYY")      // "15/06/2024"
dateFormat(d, "YYYY")            // "2024"
```

```tova
// Works with timestamps too
dateFormat(now(), "date")
```

---

## Arithmetic

### date_add

```tova
dateAdd(d, amount, unit) -> Date
```

Returns a new date with the given amount added. Units: `"years"`, `"months"`, `"days"`, `"hours"`, `"minutes"`, `"seconds"`.

```tova
d = dateFrom({ year: 2024, month: 1, day: 1 })

dateAdd(d, 10, "days")       // Jan 11, 2024
dateAdd(d, 2, "months")      // March 1, 2024
dateAdd(d, 1, "years")       // Jan 1, 2025
dateAdd(d, -7, "days")       // Dec 25, 2023
```

### date_diff

```tova
dateDiff(d1, d2, unit) -> Int
```

Returns the difference between two dates in the specified unit. Result is `d2 - d1`.

```tova
d1 = dateFrom({ year: 2024, month: 1, day: 1 })
d2 = dateFrom({ year: 2024, month: 1, day: 11 })

dateDiff(d1, d2, "days")         // 10
dateDiff(d1, d2, "hours")        // 240

d3 = dateFrom({ year: 2024, month: 6, day: 1 })
dateDiff(d1, d3, "months")       // 5
dateDiff(d1, d3, "years")        // 0
```

---

## Extracting Parts

### date_part

```tova
datePart(d, part) -> Int
```

Extracts a component from a date. Parts: `"year"`, `"month"` (1-indexed), `"day"`, `"hour"`, `"minute"`, `"second"`, `"weekday"` (0=Sunday).

```tova
d = dateFrom({ year: 2024, month: 6, day: 15, hour: 14 })

datePart(d, "year")       // 2024
datePart(d, "month")      // 6
datePart(d, "day")        // 15
datePart(d, "hour")       // 14
datePart(d, "weekday")    // 6 (Saturday)
```

---

## Human-Readable

### time_ago

```tova
timeAgo(d) -> String
```

Returns a human-readable relative time string. Accepts a `Date` or a Unix timestamp.

```tova
past = dateAdd(dateFrom({ year: 2024, month: 1, day: 1 }), -30, "seconds")
timeAgo(past)
// "30 seconds ago"

past2 = dateAdd(dateFrom({ year: 2024, month: 1, day: 1 }), -5, "minutes")
timeAgo(past2)
// "5 minutes ago"
```

```tova
// Common patterns
timeAgo(post.created_at)      // "3 hours ago"
timeAgo(user.last_seen)       // "2 days ago"
timeAgo(event.date)           // "3 months ago"
```

---

## Pipeline Examples

```tova
// Parse and format a date
"2024-06-15"
  |> dateParse()
  |> fn(r) r.unwrap()
  |> dateFormat("DD/MM/YYYY")
// "15/06/2024"

// Calculate deadline
deadline = dateFrom({ year: 2024, month: 1, day: 1 })
  |> dateAdd(30, "days")

days_left = dateDiff(now(), deadline, "days")
print("{days_left} days until deadline")

// Format timestamps for display
posts
  |> map(fn(p) merge(p, { when: timeAgo(p.created_at) }))
// [{ title: "...", when: "3 hours ago" }, ...]
```
