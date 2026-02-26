---
title: Examples
---

# Examples

Learn Tova through practical, annotated examples. Whether you are writing scripts, building CLI tools, processing data, integrating AI, or creating full-stack web applications, these examples show idiomatic Tova for every use case.

## Getting Started

- **[Hello World](./hello-world.md)** -- Your first Tova program. Covers `print`, string interpolation, functions, and running with `tova run`.

## Scripting & CLI

- **[CLI Tool](./cli-tool.md)** -- Command-line utilities: argument parsing with pattern matching, pipe-based data transformation, Result/Option error handling, and file I/O.

- **[Task Queue](./task-queue.md)** -- Async patterns and error resilience: retry logic, parallel processing with error isolation, defer for cleanup, and concurrency-limited task queues.

## Data & AI

- **[Data Dashboard](./data-dashboard.md)** -- A full-stack analytics dashboard. Demonstrates CSV reading, data pipelines, AI enrichment, and reactive client-side filtering.

- **[ETL Pipeline](./etl-pipeline.md)** -- Standalone data processing: read CSV, clean, join, aggregate, pivot, and write to multiple formats. Demonstrates Tova as a data engineering tool.

- **[AI Assistant](./ai-assistant.md)** -- An AI-powered assistant with tool use, structured extraction, semantic search, and classification. Demonstrates multiple AI providers and conversation management.

- **[Content Platform](./content-platform.md)** -- AI-enhanced content management with classification, extraction, and summarization. Demonstrates multi-model strategy, data pipeline enrichment, and refresh policies.

## Language Deep Dives

- **[Type-Driven Design](./type-driven.md)** -- Refinement types, algebraic data types, generics, exhaustive pattern matching, Result/Option chaining, and a complete form validation system.

## Full-Stack Applications

- **[Counter App](./counter.md)** -- A client-side reactive counter. Introduces `state`, `computed`, `match` expressions, and JSX components.

- **[Todo App](./todo-app.md)** -- A complete full-stack CRUD application. Covers shared types, server routes, RPC, client reactivity, effects, and component composition.

- **[Tasks App](./tasks-app.md)** -- A task management app with SQLite persistence, TailwindCSS styling, priority levels, filtering, and search. Demonstrates the ORM, computed values, match-based filtering, and form state management.

- **[Chat App](./chat.md)** -- Real-time messaging with Server-Sent Events. Demonstrates SSE endpoints, streaming data to clients, and reactive message lists.

- **[E-Commerce Store](./e-commerce.md)** -- A full e-commerce app with product browsing, cart, checkout, and orders. Demonstrates client stores, inventory guards, reactive computed values, and match-based routing.

## Server Patterns

- **[Multi-Server Architecture](./multi-server.md)** -- Named server blocks for separating API, WebSocket, and other concerns into independent processes.

- **[Authentication Flow](./auth-flow.md)** -- JWT-based authentication with registration, login, and protected endpoints. Covers password hashing, middleware, and token management.

- **[Database & Models](./database.md)** -- Database configuration, model definitions, CRUD routes, and query patterns using Tova's built-in ORM.

- **[API Gateway](./api-gateway.md)** -- Production API configuration: CORS, rate limiting, compression, caching, TLS, sessions, file uploads, middleware composition, and health checks.

- **[Monitoring Service](./monitoring-service.md)** -- Background jobs, scheduled tasks, event bus, lifecycle hooks, service discovery, and circuit breakers for production monitoring infrastructure.

- **[Real-Time Dashboard](./real-time-dashboard.md)** -- Live streaming dashboard with WebSocket metrics, SSE alerts, rolling-window aggregation, and reactive stores.

## Edge & Serverless

- **[URL Shortener](./edge-url-shortener.md)** -- A URL shortener on Cloudflare Workers. Covers KV storage, redirect responses, scheduled cleanup, and open CORS.

- **[API Proxy with Caching](./edge-api-proxy.md)** -- A caching API proxy on Deno Deploy. Covers the Deno target, middleware chains, KV caching, and error handling.

- **[Feature Flag Service](./edge-feature-flags.md)** -- A feature flag evaluator on Vercel Edge Functions. Covers security block integration, JWT authentication, role-based access, and restricted CORS.

- **[Image Pipeline](./edge-image-pipeline.md)** -- A queue-driven image processor on Cloudflare Workers. Covers named edge blocks, all five binding types (KV, SQL, Storage, Queue, Env/Secret), and scheduled reports.

- **[Webhook Handler](./edge-webhook-handler.md)** -- A webhook receiver on AWS Lambda. Covers HMAC signature verification, event dispatching, security block on Lambda, and auto-sanitization.

## Cookbook

- **[Recipes](./cookbook.md)** -- Short, focused examples for common tasks: string manipulation, file operations, HTTP requests, and more.
