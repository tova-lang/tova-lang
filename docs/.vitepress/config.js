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
  description: 'A modern full-stack language that transpiles to JavaScript',
  base: '/tova-lang/',
  head: [
    ['link', { rel: 'icon', href: '/tova-lang/favicon.ico' }],
  ],

  themeConfig: {
    logo: undefined,
    siteTitle: 'Tova',

    nav: [
      { text: 'Guide', link: '/getting-started/' },
      { text: 'Reference', link: '/reference/syntax' },
      { text: 'Full-Stack', link: '/fullstack/architecture' },
      { text: 'Stdlib', link: '/stdlib/' },
      { text: 'Tooling', link: '/tooling/cli' },
      { text: 'Examples', link: '/examples/' },
      { text: 'Architecture', link: '/architecture/patterns' },
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
          text: 'Language Guide',
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
            { text: 'Tables & Data', link: '/guide/data' },
            { text: 'I/O', link: '/guide/io' },
            { text: 'AI Integration', link: '/guide/ai' },
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
            { text: 'Server Block', link: '/fullstack/server-block' },
            { text: 'Client Block', link: '/fullstack/client-block' },
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
            { text: 'Stores', link: '/reactivity/stores' },
            { text: 'Lifecycle', link: '/reactivity/lifecycle' },
            { text: 'Advanced', link: '/reactivity/advanced' },
            { text: 'SSR', link: '/reactivity/ssr' },
            { text: 'DevTools', link: '/reactivity/devtools' },
            { text: 'Router', link: '/reactivity/router' },
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
            { text: 'Math', link: '/stdlib/math' },
            { text: 'Objects & Utilities', link: '/stdlib/objects' },
            { text: 'Result & Option', link: '/stdlib/result-option' },
            { text: 'Assertions', link: '/stdlib/assertions' },
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
            { text: 'Counter App', link: '/examples/counter' },
          ],
        },
        {
          text: 'Full-Stack Applications',
          items: [
            { text: 'Todo App', link: '/examples/todo-app' },
            { text: 'Tasks App', link: '/examples/tasks-app' },
            { text: 'Chat App', link: '/examples/chat' },
            { text: 'E-Commerce Store', link: '/examples/e-commerce' },
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
          text: 'Scripting',
          items: [
            { text: 'CLI Tool', link: '/examples/cli-tool' },
            { text: 'Task Queue', link: '/examples/task-queue' },
          ],
        },
        {
          text: 'Language Deep Dives',
          items: [
            { text: 'Type-Driven Design', link: '/examples/type-driven' },
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
      copyright: 'Copyright Tova Contributors',
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
  },
})
