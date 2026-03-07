# Charting

Tova includes built-in SVG chart generation with zero external dependencies. All chart functions take a `Table` (or array of objects) and return a self-contained SVG string.

Charts are clean and minimal (Tufte-inspired) with auto-scaled axes, gridlines, and smart tick intervals. The default size is 600x400 via `viewBox` (responsive). No interactivity, no animation, no external fonts.

---

## Quick Start

```tova
sales = read("sales.csv")

// Generate a chart and save it
sales
  |> group_by(.region)
  |> agg(revenue: sum(.amount))
  |> bar_chart(x: .region, y: .revenue, title: "Revenue by Region")
  |> write_text("chart.svg")
```

All chart functions are pipe-friendly. They return SVG strings that you can save with `write_text()`, embed in HTML, or inspect in a browser.

---

## Common Options

Every chart function accepts these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | String | `""` | Chart title (displayed at top center) |
| `width` | Int | `600` | SVG width in pixels |
| `height` | Int | `400` | SVG height in pixels |
| `color` | String | `"#4f46e5"` | Primary fill color (hex) |

The default palette for multi-series or multi-category charts uses 8 perceptually distinct colors: indigo, emerald, amber, red, violet, cyan, pink, lime.

---

## bar_chart

```tova
bar_chart(data, x:, y:, title?, width?, height?, color?, colors?) -> String
```

Vertical bar chart with one bar per row. The `x` column provides category labels, `y` provides bar heights.

```tova
sales |> bar_chart(x: .region, y: .revenue)
sales |> bar_chart(x: .region, y: .revenue, title: "Revenue by Region")
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `x` | Column | required | Category labels |
| `y` | Column | required | Bar heights (numeric) |
| `color` | String | `"#4f46e5"` | Single color for all bars |
| `colors` | [String] | palette | Array of colors, one per bar |

**Behavior:**
- X-axis labels rotate at -45 degrees when there are more than 6 categories
- Y-axis starts at 0 with auto-scaled gridlines
- Bars have 15% gap between them and rounded corners (2px radius)

---

## line_chart

```tova
line_chart(data, x:, y:, title?, width?, height?, color?, points?) -> String
```

Line chart connecting data points with a `<polyline>`. Supports both numeric and categorical x-axes.

```tova
prices |> line_chart(x: .date, y: .price, title: "Price History")
prices |> line_chart(x: .date, y: .price, points: true)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `x` | Column | required | X-axis values (numeric or categorical) |
| `y` | Column | required | Y-axis values (numeric) |
| `color` | String | `"#4f46e5"` | Line color |
| `points` | Bool | `false` | Show dots at data points |

**Behavior:**
- Numeric x-values are scaled proportionally; categorical values are evenly spaced
- X-axis labels are thinned to at most 8 labels to avoid overlap
- Line stroke width is 2px with rounded joins

---

## scatter_chart

```tova
scatter_chart(data, x:, y:, title?, width?, height?, color?, r?) -> String
```

Scatter plot with one `<circle>` per data point. Both axes are numeric with auto-scaled gridlines.

```tova
users |> scatter_chart(x: .age, y: .income, title: "Age vs Income")
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `x` | Column | required | X-axis values (numeric) |
| `y` | Column | required | Y-axis values (numeric) |
| `color` | String or [String] | `"#4f46e5"` | Dot color(s) |
| `r` | Int | `5` | Dot radius in pixels |

**Behavior:**
- Points are rendered with 70% opacity to reveal overlapping data
- Both axes show gridlines
- Color can be an array to color each point differently

---

## histogram

```tova
histogram(data, col:, bins?, title?, width?, height?, color?) -> String
```

Distribution chart that bins continuous data into uniform intervals and displays counts as bars.

```tova
users |> histogram(col: .age, title: "Age Distribution")
users |> histogram(col: .salary, bins: 30, title: "Salary Distribution")
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `col` | Column | required | Column of numeric values to bin |
| `bins` | Int | `20` | Number of bins |
| `color` | String | `"#4f46e5"` | Bar fill color |

**Behavior:**
- Non-numeric values are filtered out
- Bins are uniform width from data min to data max
- The last bin includes the maximum value
- X-axis shows up to 8 bin edge labels

---

## pie_chart

```tova
pie_chart(data, label:, value:, title?, width?, height?, colors?) -> String
```

Circular pie chart with labeled segments. Default size is 400x400.

```tova
sales |> pie_chart(label: .category, value: .revenue, title: "Revenue Split")
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `label` | Column | required | Slice labels |
| `value` | Column | required | Slice sizes (numeric) |
| `colors` | [String] | palette | Colors for each slice |

**Behavior:**
- Slices start from the top (12 o'clock position) and go clockwise
- Each slice shows its label and percentage at the arc midpoint
- A single slice renders as a full circle
- Zero total shows "No data" message

---

## heatmap

```tova
heatmap(data, x:, y:, value:, title?, width?, height?) -> String
```

Grid of colored cells for visualizing relationships between two categorical variables and a numeric value.

```tova
data |> heatmap(x: .month, y: .product, value: .sales, title: "Sales Heatmap")
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `x` | Column | required | X-axis categories |
| `y` | Column | required | Y-axis categories |
| `value` | Column | required | Cell values (numeric) |

**Behavior:**
- Color scale interpolates from white (low) to indigo (high)
- Cell values are displayed as text in each cell when cells are large enough
- Missing combinations show as white cells
- Category order matches the order of first appearance in the data

---

## Saving Charts

All chart functions return SVG strings. Use `write_text()` to save:

```tova
// Save single chart
chart = sales |> bar_chart(x: .region, y: .revenue)
write_text("chart.svg", chart)

// Pipe-friendly
sales
  |> bar_chart(x: .region, y: .revenue)
  |> write_text("chart.svg")
```

SVG files can be opened directly in any browser, embedded in HTML, or converted to PNG/PDF with external tools.

---

## Pipeline Integration

Charts compose naturally with table pipelines:

```tova
// Transform, aggregate, then visualize
orders = read("orders.csv")

orders
  |> where(.status == "completed")
  |> group_by(.category)
  |> agg(total: sum(.amount), orders: count())
  |> sort_by(.total, desc: true)
  |> limit(10)
  |> bar_chart(x: .category, y: .total, title: "Top 10 Categories")
  |> write_text("top_categories.svg")

// Multiple charts from the same data
by_month = orders
  |> group_by(.month)
  |> agg(revenue: sum(.amount))

by_month |> line_chart(x: .month, y: .revenue) |> write_text("trend.svg")
by_month |> bar_chart(x: .month, y: .revenue) |> write_text("bars.svg")
```

---

## Empty Data

All chart functions handle empty data gracefully. When the input table has zero rows, they return an SVG with a centered "No data" message instead of crashing.
