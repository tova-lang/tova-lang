# Real-Time Dashboard

This example builds a live streaming dashboard with WebSocket metrics, SSE alerts, scheduled data generation, rolling-window aggregation, and reactive client components. It demonstrates WebSocket endpoints, server-sent events, client lifecycle hooks, and stores for real-time state management.

## The Full Application

```tova
shared {
  type Metric {
    name: String
    value: Float
    unit: String
    timestamp: String
  }

  type Alert {
    id: String
    message: String
    severity: String
    timestamp: String
  }

  type Stats {
    avg: Float
    max: Float
    min: Float
    count: Int
  }
}

server {
  env METRIC_INTERVAL_MS: Int = 1000
  env ALERT_CHECK_SEC: Int = 10
  env WINDOW_SIZE: Int = 60

  var metrics_buffer = []
  var alert_subscribers = []

  // --- Scheduled Metric Generation (simulated) ---

  schedule "* * * * * *" fn() {
    cpu = Metric {
      name: "cpu_usage",
      value: Math.random() * 100.0,
      unit: "%",
      timestamp: Date.now()
    }

    memory = Metric {
      name: "memory_usage",
      value: 40.0 + Math.random() * 40.0,
      unit: "%",
      timestamp: Date.now()
    }

    requests = Metric {
      name: "requests_per_sec",
      value: Math.floor(Math.random() * 500.0),
      unit: "req/s",
      timestamp: Date.now()
    }

    latency = Metric {
      name: "avg_latency",
      value: 10.0 + Math.random() * 90.0,
      unit: "ms",
      timestamp: Date.now()
    }

    new_metrics = [cpu, memory, requests, latency]
    metrics_buffer = [...metrics_buffer, ...new_metrics]
      |> take_last(WINDOW_SIZE * 4)

    // Broadcast to WebSocket clients
    ws.broadcast(JSON.stringify({ "type": "metrics", data: new_metrics }))

    // Check alert thresholds
    if cpu.value > 90.0 {
      fire_alert("CPU usage critical: {cpu.value |> round(1)}%", "critical")
    }
    if memory.value > 85.0 {
      fire_alert("Memory usage high: {memory.value |> round(1)}%", "warning")
    }
    if latency.value > 80.0 {
      fire_alert("Latency spike: {latency.value |> round(1)}ms", "warning")
    }
  }

  fn fire_alert(message: String, severity: String) {
    alert = Alert {
      id: uuid(),
      message: message,
      severity: severity,
      timestamp: Date.now()
    }
    alert_subscribers |> each(fn(send) send(alert))
  }

  // --- WebSocket Endpoint ---

  ws {
    on_open fn(ws) {
      // Send current buffer as initial state
      ws.send(JSON.stringify({
        "type": "initial",
        data: metrics_buffer
      }))
    }

    on_message fn(ws, msg) {
      data = JSON.parse(msg)
      match data["type"] {
        "subscribe" => {
          // Client can subscribe to specific metrics
          ws.send(JSON.stringify({ "type": "subscribed", metrics: data.metrics }))
        }
        "ping" => {
          ws.send(JSON.stringify({ "type": "pong", timestamp: Date.now() }))
        }
        _ => {}
      }
    }

    on_close fn(ws) {
      print("[ws] Client disconnected")
    }
  }

  // --- SSE Endpoint for Alerts ---

  sse "/events/alerts" fn(send, close) {
    handler = fn(alert: Alert) {
      send(JSON.stringify(alert))
    }
    alert_subscribers = [...alert_subscribers, handler]

    // Send heartbeat every 30 seconds
    interval = set_interval(30000, fn() {
      send(JSON.stringify({ "type": "heartbeat", timestamp: Date.now() }))
    })

    on_close {
      alert_subscribers = alert_subscribers |> filter(fn(h) h != handler)
      clear_interval(interval)
    }
  }

  // --- REST Endpoints ---

  fn get_current_stats() {
    fn compute_stats(name: String) -> Stats {
      values = metrics_buffer
        |> filter(fn(m) m.name == name)
        |> map(fn(m) m.value)

      match values |> len() {
        0 => Stats { avg: 0.0, max: 0.0, min: 0.0, count: 0 }
        _ => Stats {
          avg: values |> sum() / (values |> len() |> to_float()),
          max: values |> max_val(),
          min: values |> min_val(),
          count: values |> len()
        }
      }
    }

    {
      cpu: compute_stats("cpu_usage"),
      memory: compute_stats("memory_usage"),
      requests: compute_stats("requests_per_sec"),
      latency: compute_stats("avg_latency")
    }
  }

  fn get_recent_metrics(count: Option<Int>) -> [Metric] {
    metrics_buffer |> take_last(count |> unwrapOr(60))
  }

  route GET "/api/stats" => get_current_stats
  route GET "/api/metrics/recent" => get_recent_metrics
}

client {
  // --- Stores ---

  store StatsStore {
    state metrics: [Metric] = []
    state window_size = 60

    computed cpu_metrics = metrics |> filter(fn(m) m.name == "cpu_usage")
    computed memory_metrics = metrics |> filter(fn(m) m.name == "memory_usage")
    computed request_metrics = metrics |> filter(fn(m) m.name == "requests_per_sec")
    computed latency_metrics = metrics |> filter(fn(m) m.name == "avg_latency")

    computed cpu_stats = compute_stats(cpu_metrics)
    computed memory_stats = compute_stats(memory_metrics)
    computed request_stats = compute_stats(request_metrics)
    computed latency_stats = compute_stats(latency_metrics)

    fn add_metrics(new_metrics: [Metric]) {
      metrics = [...metrics, ...new_metrics]
        |> take_last(window_size * 4)
    }

    fn set_initial(initial: [Metric]) {
      metrics = initial
    }
  }

  store AlertStore {
    state alerts: [Alert] = []
    state max_alerts = 50

    computed active_count = alerts |> len()
    computed critical_count = alerts
      |> filter(fn(a) a.severity == "critical")
      |> len()

    fn add_alert(alert: Alert) {
      alerts = [alert, ...alerts] |> take(max_alerts)
    }

    fn dismiss(id: String) {
      alerts = alerts |> filter(fn(a) a.id != id)
    }

    fn clear() { alerts = [] }
  }

  // --- Helper ---

  fn compute_stats(values: [Metric]) -> Stats {
    nums = values |> map(fn(m) m.value)
    match nums |> len() {
      0 => Stats { avg: 0.0, max: 0.0, min: 0.0, count: 0 }
      _ => Stats {
        avg: nums |> sum() / (nums |> len() |> to_float()),
        max: nums |> max_val(),
        min: nums |> min_val(),
        count: nums |> len()
      }
    }
  }

  // --- Connection State ---

  state connected = false
  state last_update: Option<String> = None

  // --- WebSocket Connection ---

  effect {
    ws = WebSocket.new("ws://localhost:3000/ws/metrics")

    ws.onopen = fn() {
      connected = true
    }

    ws.onmessage = fn(event) {
      data = JSON.parse(event.data)
      match data["type"] {
        "initial" => StatsStore.set_initial(data.data)
        "metrics" => {
          StatsStore.add_metrics(data.data)
          last_update = Some(Date.now())
        }
        _ => {}
      }
    }

    ws.onclose = fn() {
      connected = false
    }

    ws.onerror = fn() {
      connected = false
    }

    onCleanup fn() {
      ws.close()
    }
  }

  // --- SSE Connection for Alerts ---

  effect {
    source = EventSource.new("/events/alerts")

    source.onmessage = fn(event) {
      data = JSON.parse(event.data)
      match data["type"] {
        "heartbeat" => {}
        _ => AlertStore.add_alert(data)
      }
    }

    source.onerror = fn() {
      print("Alert stream error")
    }

    onCleanup fn() {
      source.close()
    }
  }

  // --- Components ---

  component ConnectionStatus {
    <div class={match connected { true => "status connected" false => "status disconnected" }}>
      <span class="dot" />
      <span>{match connected { true => "Live" false => "Disconnected" }}</span>
      {match last_update {
        Some(time) => <span class="time">"Updated: {time}"</span>
        None => {}
      }}
    </div>
  }

  component MetricCard(label: String, stats: Stats, unit: String) {
    <div class="metric-card">
      <h3>{label}</h3>
      <div class="current">
        <span class="value">{stats.avg |> round(1)}</span>
        <span class="unit">{unit}</span>
      </div>
      <div class="range">
        <span>"Min: {stats.min |> round(1)}"</span>
        <span>"Max: {stats.max |> round(1)}"</span>
      </div>
      <div class="samples">"({stats.count} samples)"</div>
    </div>
  }

  component MetricCards {
    <div class="metric-cards">
      <MetricCard label="CPU Usage" stats={StatsStore.cpu_stats} unit="%" />
      <MetricCard label="Memory" stats={StatsStore.memory_stats} unit="%" />
      <MetricCard label="Requests/sec" stats={StatsStore.request_stats} unit="req/s" />
      <MetricCard label="Latency" stats={StatsStore.latency_stats} unit="ms" />
    </div>
  }

  component LiveChart(metrics: [Metric], label: String) {
    state chart_ref = nil

    onMount {
      // Placeholder for chart rendering
      print("Chart mounted for {label}")
    }

    <div class="chart">
      <h3>{label}</h3>
      <div class="chart-area" ref={chart_ref}>
        <div class="sparkline">
          for m in metrics |> take_last(30) {
            <div
              class="bar"
              style={"height: {m.value}%; width: {100.0 / 30.0}%"}
              title={"{m.value |> round(1)} at {m.timestamp}"}
            />
          }
        </div>
      </div>
    </div>
  }

  component AlertFeed {
    <div class="alert-feed">
      <div class="alert-header">
        <h3>"Alerts ({AlertStore.active_count})"</h3>
        {if AlertStore.active_count > 0 {
          <button onclick={fn() AlertStore.clear()}>"Clear All"</button>
        }}
      </div>

      {match AlertStore.alerts |> len() {
        0 => <p class="no-alerts">"No active alerts"</p>
        _ => {
          <div class="alerts">
            for alert in AlertStore.alerts {
              <div class={"alert alert-{alert.severity}"}>
                <div class="alert-content">
                  <span class="severity">{alert.severity |> upper()}</span>
                  <span class="message">{alert.message}</span>
                  <span class="time">{alert.timestamp}</span>
                </div>
                <button onclick={fn() AlertStore.dismiss(alert.id)}>"×"</button>
              </div>
            }
          </div>
        }
      }}
    </div>
  }

  component App {
    <div class="dashboard">
      <header>
        <h1>"Live Dashboard"</h1>
        <ConnectionStatus />
        {if AlertStore.critical_count > 0 {
          <span class="critical-badge">
            "{AlertStore.critical_count} Critical"
          </span>
        }}
      </header>

      <MetricCards />

      <div class="charts">
        <LiveChart metrics={StatsStore.cpu_metrics} label="CPU Usage (%)" />
        <LiveChart metrics={StatsStore.memory_metrics} label="Memory Usage (%)" />
        <LiveChart metrics={StatsStore.request_metrics} label="Requests/sec" />
        <LiveChart metrics={StatsStore.latency_metrics} label="Latency (ms)" />
      </div>

      <AlertFeed />
    </div>
  }
}
```

## Running It

```bash
tova dev dashboard.tova
```

## What This Demonstrates

### WebSocket Endpoint

```tova
websocket "/ws/metrics" {
  on_open(ws) {
    ws.send(JSON.stringify({ "type": "initial", data: metrics_buffer }))
  }
  on_message(ws, msg) {
    match JSON.parse(msg)["type"] {
      "subscribe" => ws.send(...)
      "ping" => ws.send(...)
    }
  }
  on_close(ws) { ... }
}
```

The WebSocket endpoint handles connection lifecycle. On open, it sends the current metrics buffer so new clients see historical data immediately. Message handling uses pattern matching on the message type.

### SSE Endpoint for Alerts

```tova
sse "/events/alerts" fn(send, close) {
  handler = fn(alert) { send(JSON.stringify(alert)) }
  alert_subscribers = [...alert_subscribers, handler]

  on_close {
    alert_subscribers = alert_subscribers |> filter(fn(h) h != handler)
  }
}
```

SSE is used for alerts because it's one-way (server to client) and auto-reconnects. The handler registers a callback that sends each alert to the connected client. On disconnect, the handler is removed.

### Scheduled Data Generation

```tova
schedule "generate_metrics" cron("* * * * * *") {
  cpu = Metric { name: "cpu_usage", value: Math.random() * 100.0, ... }
  // ...
  ws.broadcast(JSON.stringify({ "type": "metrics", data: new_metrics }))
}
```

The scheduled task generates simulated metrics every second and broadcasts to all WebSocket clients. In production, this would collect real metrics from system monitoring.

### Client WebSocket with Lifecycle

```tova
effect {
  ws = WebSocket.new("ws://localhost:3000/ws/metrics")

  ws.onopen = fn() { connected = true }
  ws.onmessage = fn(event) {
    data = JSON.parse(event.data)
    match data["type"] {
      "initial" => StatsStore.set_initial(data.data)
      "metrics" => StatsStore.add_metrics(data.data)
    }
  }
  ws.onclose = fn() { connected = false }

  onCleanup fn() { ws.close() }
}
```

The effect opens a WebSocket connection when the component mounts. `onCleanup` ensures the connection is closed when the component unmounts, preventing leaks.

### Client Stores for Real-Time State

```tova
store StatsStore {
  state metrics: [Metric] = []

  computed cpu_metrics = metrics |> filter(fn(m) m.name == "cpu_usage")
  computed cpu_stats = compute_stats(cpu_metrics)

  fn add_metrics(new_metrics: [Metric]) {
    metrics = [...metrics, ...new_metrics] |> take_last(window_size * 4)
  }
}
```

The `StatsStore` holds a rolling window of metrics. Computed values automatically filter by metric name and calculate aggregations. When `add_metrics` is called from the WebSocket handler, all computed values update reactively.

### Rolling Window Aggregation

```tova
fn add_metrics(new_metrics: [Metric]) {
  metrics = [...metrics, ...new_metrics]
    |> take_last(window_size * 4)   // Keep last 60 × 4 metric types
}
```

The metrics array is capped with `take_last()` to maintain a sliding window. As new metrics arrive, old ones drop off. Computed stats always reflect the current window.

### Reactive Component Tree

The `MetricCards` component reads `StatsStore.cpu_stats`, `StatsStore.memory_stats`, etc. These are computed values that re-evaluate when the underlying metrics change. The entire dashboard updates automatically when new WebSocket data arrives — no manual refresh needed.

### onMount for Chart Initialization

```tova
component LiveChart(metrics: [Metric], label: String) {
  state chart_ref = nil

  onMount {
    // Initialize chart library here
  }

  <div class="chart-area" ref={chart_ref}>...</div>
}
```

`onMount` runs after the component's DOM is rendered, making it safe to initialize chart libraries that need a DOM reference.

## Key Patterns

**WebSocket for streaming data, SSE for events.** Metrics use WebSocket for bidirectional, high-frequency updates. Alerts use SSE for simple one-way notification with automatic reconnection.

**Stores for domain state.** `StatsStore` owns metrics and computed stats. `AlertStore` owns alerts and counts. Components read from stores reactively.

**Rolling window with take_last.** Cap arrays to maintain constant memory. Computed aggregations always reflect the current window.

**onCleanup for connection lifecycle.** Close WebSocket and SSE connections in `onCleanup` to prevent resource leaks when components unmount.
