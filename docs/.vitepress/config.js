import { defineConfig } from 'vitepress'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load Tova TextMate grammar for syntax highlighting
let tovaGrammar
try {
  tovaGrammar = JSON.parse(
    readFileSync(resolve(__dirname, '../../editors/vscode/syntaxes/tova.tmLanguage.json'), 'utf-8')
  )
} catch {
  tovaGrammar = null
}

export default defineConfig({
  title: 'Tova',
  description: 'A modern programming language for scripting, data, AI, and full-stack web',
  base: '/tova-lang/',
  head: [
    ['link', { rel: 'icon', href: '/tova-lang/favicon.ico' }],
  ],

  themeConfig: {
    logo: undefined,
    siteTitle: 'Tova',

    nav: [
      { text: 'Why Tova?', link: '/why-tova' },
      { text: 'Guide', link: '/getting-started/' },
      { text: 'Tutorial', link: '/tutorial' },
      { text: 'Reference', link: '/reference/syntax' },
      { text: 'Stdlib', link: '/stdlib/' },
      { text: 'Examples', link: '/examples/' },
      { text: 'Tooling', link: '/tooling/cli' },
      {
        text: 'App Models',
        items: [
          { text: 'Full-Stack Web', link: '/fullstack/architecture' },
          { text: 'Server', link: '/server/routes' },
          { text: 'Reactive UI', link: '/reactivity/signals' },
          { text: 'CLI Apps', link: '/fullstack/cli-block' },
          { text: 'Data Pipelines', link: '/fullstack/data-block' },
          { text: 'AI Integration', link: '/guide/ai' },
        ],
      },
      { text: 'Playground', link: '/playground' },
    ],

    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Installation', link: '/getting-started/' },
            { text: 'Hello World', link: '/getting-started/hello-world' },
            { text: 'Tour of Tova', link: '/getting-started/tour' },
          ],
        },
      ],

      '/guide/': [
        {
          text: 'Core Language',
          items: [
            { text: 'Variables', link: '/guide/variables' },
            { text: 'Functions', link: '/guide/functions' },
            { text: 'Control Flow', link: '/guide/control-flow' },
            { text: 'Pattern Matching', link: '/guide/pattern-matching' },
            { text: 'Types', link: '/guide/types' },
            { text: 'Generics', link: '/guide/generics' },
            { text: 'Interfaces & Traits', link: '/guide/interfaces-traits' },
            { text: 'Error Handling', link: '/guide/error-handling' },
            { text: 'Modules', link: '/guide/modules' },
            { text: 'Collections', link: '/guide/collections' },
            { text: 'Strings', link: '/guide/strings' },
            { text: 'Async', link: '/guide/async' },
            { text: 'Pipes', link: '/guide/pipes' },
          ],
        },
        {
          text: 'Scripting & I/O',
          items: [
            { text: 'Tables & Data', link: '/guide/data' },
            { text: 'I/O', link: '/guide/io' },
            { text: 'JS Interop', link: '/guide/js-interop' },
          ],
        },
        {
          text: 'Performance',
          items: [
            { text: 'Performance', link: '/guide/performance' },
          ],
        },
        {
          text: 'Coming From...',
          items: [
            { text: 'Python Developers', link: '/guide/from-python' },
            { text: 'JavaScript Developers', link: '/guide/from-javascript' },
          ],
        },
      ],

      '/reference/': [
        {
          text: 'Language Reference',
          items: [
            { text: 'Syntax', link: '/reference/syntax' },
            { text: 'Operators', link: '/reference/operators' },
            { text: 'Keywords', link: '/reference/keywords' },
            { text: 'Type System', link: '/reference/type-system' },
            { text: 'Grammar', link: '/reference/grammar' },
            { text: 'Language Specification', link: '/reference/spec' },
          ],
        },
      ],

      '/fullstack/': [
        {
          text: 'Full-Stack Architecture',
          items: [
            { text: 'Architecture Overview', link: '/fullstack/architecture' },
            { text: 'Shared Block', link: '/fullstack/shared-block' },
            { text: 'Data Block', link: '/fullstack/data-block' },
            { text: 'Security Block', link: '/fullstack/security-block' },
            { text: 'CLI Block', link: '/fullstack/cli-block' },
            { text: 'Server Block', link: '/fullstack/server-block' },
            { text: 'Browser Block', link: '/fullstack/browser-block' },
            { text: 'RPC Bridge', link: '/fullstack/rpc' },
            { text: 'Named Blocks', link: '/fullstack/named-blocks' },
            { text: 'Compilation', link: '/fullstack/compilation' },
          ],
        },
      ],

      '/server/': [
        {
          text: 'Server Reference',
          items: [
            { text: 'Routes', link: '/server/routes' },
            { text: 'Middleware', link: '/server/middleware' },
            { text: 'Database', link: '/server/database' },
            { text: 'Models', link: '/server/models' },
            { text: 'Authentication', link: '/server/auth' },
            { text: 'WebSocket', link: '/server/websocket' },
            { text: 'Server-Sent Events', link: '/server/sse' },
            { text: 'Configuration', link: '/server/configuration' },
            { text: 'Advanced', link: '/server/advanced' },
          ],
        },
      ],

      '/reactivity/': [
        {
          text: 'Reactive UI',
          items: [
            { text: 'Signals', link: '/reactivity/signals' },
            { text: 'Computed Values', link: '/reactivity/computed' },
            { text: 'Effects', link: '/reactivity/effects' },
            { text: 'Components', link: '/reactivity/components' },
            { text: 'JSX', link: '/reactivity/jsx' },
            { text: 'Styling', link: '/reactivity/styling' },
            { text: 'Directives', link: '/reactivity/directives' },
            { text: 'Transitions', link: '/reactivity/transitions' },
            { text: 'Stores', link: '/reactivity/stores' },
            { text: 'Lifecycle', link: '/reactivity/lifecycle' },
            { text: 'Advanced', link: '/reactivity/advanced' },
            { text: 'SSR', link: '/reactivity/ssr' },
            { text: 'DevTools', link: '/reactivity/devtools' },
            { text: 'Router', link: '/reactivity/router' },
            { text: 'Testing', link: '/reactivity/testing' },
          ],
        },
      ],

      '/stdlib/': [
        {
          text: 'Standard Library',
          items: [
            { text: 'Overview', link: '/stdlib/' },
            { text: 'Collections', link: '/stdlib/collections' },
            { text: 'Strings', link: '/stdlib/strings' },
            { text: 'Math & Stats', link: '/stdlib/math' },
            { text: 'Objects & Utilities', link: '/stdlib/objects' },
            { text: 'Functional', link: '/stdlib/functional' },
            { text: 'Regex', link: '/stdlib/regex' },
            { text: 'Validation', link: '/stdlib/validation' },
            { text: 'URL & UUID', link: '/stdlib/url' },
            { text: 'Date & Time', link: '/stdlib/datetime' },
            { text: 'JSON', link: '/stdlib/json' },
            { text: 'Encoding', link: '/stdlib/encoding' },
            { text: 'Async & Error Handling', link: '/stdlib/async' },
            { text: 'Result & Option', link: '/stdlib/result-option' },
            { text: 'Type Conversion', link: '/stdlib/conversion' },
            { text: 'Assertions', link: '/stdlib/assertions' },
            { text: 'Lazy Iterators', link: '/stdlib/iterators' },
            { text: 'Advanced Collections', link: '/stdlib/advanced-collections' },
            { text: 'Channels', link: '/stdlib/channels' },
            { text: 'Terminal & CLI', link: '/stdlib/terminal' },
            { text: 'Scripting I/O', link: '/stdlib/io' },
            { text: 'Tables', link: '/stdlib/tables' },
            { text: 'Testing', link: '/stdlib/testing' },
          ],
        },
      ],

      '/tooling/': [
        {
          text: 'Developer Tools',
          items: [
            { text: 'CLI Reference', link: '/tooling/cli' },
            { text: 'Build System', link: '/tooling/build' },
            { text: 'REPL', link: '/tooling/repl' },
            { text: 'Formatter', link: '/tooling/formatter' },
            { text: 'Test Runner', link: '/tooling/test-runner' },
            { text: 'Dev Server', link: '/tooling/dev-server' },
            { text: 'Deployment', link: '/tooling/deployment' },
          ],
        },
      ],

      '/editor/': [
        {
          text: 'Editor Support',
          items: [
            { text: 'VS Code', link: '/editor/vscode' },
            { text: 'LSP Server', link: '/editor/lsp' },
          ],
        },
      ],

      '/examples/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Hello World', link: '/examples/hello-world' },
          ],
        },
        {
          text: 'Scripting & CLI',
          items: [
            { text: 'CLI Tool', link: '/examples/cli-tool' },
            { text: 'Task Queue', link: '/examples/task-queue' },
          ],
        },
        {
          text: 'Data & AI',
          items: [
            { text: 'Data Dashboard', link: '/examples/data-dashboard' },
            { text: 'ETL Pipeline', link: '/examples/etl-pipeline' },
            { text: 'AI Assistant', link: '/examples/ai-assistant' },
            { text: 'Content Platform', link: '/examples/content-platform' },
          ],
        },
        {
          text: 'Language Deep Dives',
          items: [
            { text: 'Type-Driven Design', link: '/examples/type-driven' },
          ],
        },
        {
          text: 'Full-Stack Applications',
          items: [
            { text: 'Counter App', link: '/examples/counter' },
            { text: 'Todo App', link: '/examples/todo-app' },
            { text: 'Tasks App', link: '/examples/tasks-app' },
            { text: 'Chat App', link: '/examples/chat' },
            { text: 'E-Commerce Store', link: '/examples/e-commerce' },
          ],
        },
        {
          text: 'Server Patterns',
          items: [
            { text: 'Multi-Server', link: '/examples/multi-server' },
            { text: 'Auth Flow', link: '/examples/auth-flow' },
            { text: 'Database', link: '/examples/database' },
            { text: 'API Gateway', link: '/examples/api-gateway' },
            { text: 'Monitoring Service', link: '/examples/monitoring-service' },
            { text: 'Real-Time Dashboard', link: '/examples/real-time-dashboard' },
          ],
        },
        {
          text: 'Cookbook',
          items: [
            { text: 'Recipes', link: '/examples/cookbook' },
          ],
        },
      ],

      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Design Patterns', link: '/architecture/patterns' },
            { text: 'Scaling Applications', link: '/architecture/scaling' },
            { text: 'Data Engineering', link: '/architecture/data-engineering' },
          ],
        },
      ],

      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Contributing Guide', link: '/contributing/' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/tovalang/tova' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/tovalang/tova/edit/main/docs/:path',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright Enoch Kujem Abassey and Tova Contributors',
    },
  },

  markdown: {
    languages: tovaGrammar ? [
      {
        ...tovaGrammar,
        name: 'tova',
        scopeName: tovaGrammar.scopeName || 'source.tova',
      },
    ] : [],
    codeTransformers: [
      {
        name: 'escape-vue-curly-braces',
        postprocess(html) {
          // Escape { and } in code block HTML so Vue's SFC parser
          // doesn't interpret them as template expressions
          return html
            .replace(/\{/g, '&#123;')
            .replace(/\}/g, '&#125;')
        },
      },
    ],
  },
})
