// src/cli/new.js — New project scaffolding
import { resolve, basename, dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { color, _compatSpawnSync } from './utils.js';
import { VERSION } from '../version.js';
import { writePackageJson } from '../config/package-json.js';
import { stringifyTOML } from '../config/toml.js';

function fullstackAuthContent(name) {
  return `// ${name} — Built with Tova
// Full-stack app with authentication and security

shared {
  type User {
    id: String
    email: String
    role: String
  }
}

security {
  cors {
    origins: ["http://localhost:3000"]
    methods: ["GET", "POST", "PUT", "DELETE"]
    credentials: true
  }

  csrf {
    enabled: true
  }

  rate_limit {
    window: 60
    max: 100
  }

  csp {
    default_src: ["self"]
    script_src: ["self", "https://cdn.tailwindcss.com"]
    style_src: ["self", "unsafe-inline"]
    img_src: ["self", "data:", "https:"]
    connect_src: ["self"]
  }
}

auth {
  secret: env("AUTH_SECRET")
  token_expires: 900
  refresh_expires: 604800
  storage: "cookie"

  provider email {
    confirm_email: true
    password_min: 8
    max_attempts: 5
    lockout_duration: 900
  }

  on signup fn(user) {
    print("New user signed up: " + user.email)
  }

  on login fn(user) {
    print("User logged in: " + user.email)
  }

  on logout fn(user) {
    print("User logged out: " + user.id)
  }

  protected_route "/dashboard" { redirect: "/login" }
  protected_route "/dashboard/*" { redirect: "/login" }
  protected_route "/settings" { redirect: "/login" }
}

server {
  fn get_message() {
    { text: "Hello from ${name}!", timestamp: Date.new().toLocaleTimeString() }
  }

  route GET "/api/message" => get_message
}

browser {
  state message = ""
  state timestamp = ""
  state refreshing = false

  effect {
    result = server.get_message()
    message = result.text
    timestamp = result.timestamp
  }

  fn handle_refresh() {
    refreshing = true
    result = server.get_message()
    message = result.text
    timestamp = result.timestamp
    refreshing = false
  }

  // \u2500\u2500\u2500 Navigation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component NavBar {
    <nav class="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" class="flex items-center gap-2 no-underline">
          <div class="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-sm">"T"</span>
          </div>
          <span class="font-bold text-gray-900 text-lg">"${name}"</span>
        </Link>
        <div class="flex items-center gap-4">
          <Link href="/" exactActiveClass="text-emerald-600 font-semibold" class="text-sm font-medium text-gray-500 hover:text-gray-900 no-underline">"Home"</Link>
          if $isAuthenticated {
            <Link href="/dashboard" activeClass="text-emerald-600 font-semibold" class="text-sm font-medium text-gray-500 hover:text-gray-900 no-underline">"Dashboard"</Link>
            <div class="flex items-center gap-3 ml-2 pl-4 border-l border-gray-200">
              <span class="text-sm text-gray-500">
                if $currentUser != null {
                  {$currentUser.email}
                }
              </span>
              <button
                on:click={fn() { logout() }}
                class="text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                "Sign Out"
              </button>
            </div>
          } else {
            <Link href="/login" class="text-sm font-medium text-gray-500 hover:text-gray-900 no-underline">"Login"</Link>
            <Link href="/signup" class="text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-lg no-underline transition-colors">"Sign Up"</Link>
          }
        </div>
      </div>
    </nav>
  }

  // \u2500\u2500\u2500 Pages \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component FeatureCard(icon, title, description) {
    <div class="group relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-emerald-100 transition-all duration-300">
      <div class="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-lg mb-4 group-hover:bg-emerald-100 transition-colors">
        "{icon}"
      </div>
      <h3 class="font-semibold text-gray-900 mb-1">"{title}"</h3>
      <p class="text-sm text-gray-500 leading-relaxed">"{description}"</p>
    </div>
  }

  component HomePage {
    <main class="max-w-5xl mx-auto px-6">
      <div class="py-20 text-center">
        <div class="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
          "Secure by Default"
        </div>
        <h1 class="text-5xl font-bold text-gray-900 tracking-tight mb-4">"Welcome to " <span class="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">"${name}"</span></h1>
        <p class="text-xl text-gray-500 max-w-2xl mx-auto mb-10">"A full-stack app with authentication. Edit " <code class="text-sm bg-gray-100 text-emerald-600 px-2 py-1 rounded-md font-mono">"src/app.tova"</code> " to get started."</p>

        if $isAuthenticated {
          <Link href="/dashboard" class="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-3 rounded-xl no-underline transition-colors">
            "Go to Dashboard"
          </Link>
        } else {
          <div class="flex items-center justify-center gap-4">
            <Link href="/signup" class="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-3 rounded-xl no-underline transition-colors">"Get Started"</Link>
            <Link href="/login" class="inline-block bg-white border border-gray-200 hover:border-gray-300 text-gray-700 font-medium px-6 py-3 rounded-xl no-underline transition-colors">"Sign In"</Link>
          </div>
        }

        if timestamp != "" {
          <p class="text-xs text-gray-400 mt-6">"Server time: " "{timestamp}"</p>
        }
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 pb-20">
        <FeatureCard
          icon="\u2699"
          title="Full-Stack"
          description="Server and client in one file. Shared types, RPC calls, and reactive UI."
        />
        <FeatureCard
          icon="\uD83D\uDD12"
          title="Auth Built-in"
          description="Email signup, login, password reset, and JWT sessions \u2014 secure by default."
        />
        <FeatureCard
          icon="\uD83D\uDEE1"
          title="Security Hardened"
          description="CORS, CSRF, CSP, rate limiting, brute-force lockout, and HttpOnly cookies."
        />
      </div>
    </main>
  }

  // \u2500\u2500\u2500 Auth Pages \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component LoginPage {
    <main class="max-w-md mx-auto px-6 py-16">
      <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">"Sign In"</h2>
      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <LoginForm />
        <div class="mt-6 text-center">
          <Link href="/forgot-password" class="text-sm text-emerald-600 hover:text-emerald-700 no-underline">"Forgot your password?"</Link>
        </div>
        <div class="mt-4 text-center">
          <span class="text-sm text-gray-500">"Don't have an account? "</span>
          <Link href="/signup" class="text-sm text-emerald-600 hover:text-emerald-700 font-medium no-underline">"Sign Up"</Link>
        </div>
      </div>
    </main>
  }

  component SignupPage {
    <main class="max-w-md mx-auto px-6 py-16">
      <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">"Create Account"</h2>
      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <SignupForm />
        <div class="mt-4 text-center">
          <span class="text-sm text-gray-500">"Already have an account? "</span>
          <Link href="/login" class="text-sm text-emerald-600 hover:text-emerald-700 font-medium no-underline">"Sign In"</Link>
        </div>
      </div>
    </main>
  }

  component ForgotPasswordPage {
    <main class="max-w-md mx-auto px-6 py-16">
      <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">"Reset Password"</h2>
      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <ForgotPasswordForm />
        <div class="mt-4 text-center">
          <Link href="/login" class="text-sm text-emerald-600 hover:text-emerald-700 no-underline">"Back to login"</Link>
        </div>
      </div>
    </main>
  }

  // \u2500\u2500\u2500 Protected Pages \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component DashboardPage {
    <AuthGuard redirect="/login">
      <main class="max-w-5xl mx-auto px-6 py-8">
        <div class="mb-8">
          <h2 class="text-2xl font-bold text-gray-900">"Dashboard"</h2>
          <p class="text-gray-500">
            "Welcome back"
            if $currentUser != null {
              ", " "{$currentUser.email}"
            }
          </p>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-8">
          <div class="text-center">
            <div class="inline-flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
              <div class="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-2.5 rounded-xl font-medium">
                "{message}"
              </div>
              <button
                on:click={handle_refresh}
                class="px-4 py-2.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-medium text-sm"
              >
                if refreshing { "..." } else { "Refresh" }
              </button>
            </div>
            if timestamp != "" {
              <p class="text-xs text-gray-400 mt-3">"Server time: " "{timestamp}"</p>
            }
          </div>
        </div>
      </main>
    </AuthGuard>
  }

  component SettingsPage {
    <AuthGuard redirect="/login">
      <main class="max-w-2xl mx-auto px-6 py-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">"Settings"</h2>
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <h3 class="font-semibold text-gray-900 mb-4">"Account"</h3>
          if $currentUser != null {
            <div class="space-y-3">
              <div>
                <span class="text-sm text-gray-500">"Email: "</span>
                <span class="text-sm font-medium text-gray-900">{$currentUser.email}</span>
              </div>
              <div>
                <span class="text-sm text-gray-500">"Role: "</span>
                <span class="text-sm font-medium text-gray-900">{$currentUser.role}</span>
              </div>
            </div>
          }
        </div>
      </main>
    </AuthGuard>
  }

  component NotFoundPage {
    <div class="max-w-5xl mx-auto px-6 py-16 text-center">
      <h1 class="text-6xl font-bold text-gray-200 mb-4">"404"</h1>
      <p class="text-lg text-gray-500 mb-6">"Page not found"</p>
      <Link href="/" class="text-emerald-600 hover:text-emerald-700 font-medium no-underline">"Go home"</Link>
    </div>
  }

  // \u2500\u2500\u2500 Router \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  createRouter({
    routes: {
      "/": HomePage,
      "/login": LoginPage,
      "/signup": SignupPage,
      "/forgot-password": ForgotPasswordPage,
      "/dashboard": DashboardPage,
      "/settings": SettingsPage,
      "404": NotFoundPage,
    },
    scroll: "auto",
  })

  component App {
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      <NavBar />
      <Router />
      <div class="border-t border-gray-100 py-8 text-center">
        <p class="text-sm text-gray-400">"Built with " <a href="https://github.com/tova-lang/tova-lang" class="text-emerald-500 hover:text-emerald-600 transition-colors">"Tova"</a></p>
      </div>
    </div>
  }
}
`;
}

// ─── Auth template content (SPA + auth) ──────────────────────────
function spaAuthContent(name) {
  return `// ${name} — Built with Tova
// Single-page app with authentication, nested routes, and dynamic params

shared {
  type User {
    id: String
    email: String
    role: String
  }
}

security {
  cors {
    origins: ["http://localhost:3000"]
    methods: ["GET", "POST", "PUT", "DELETE"]
    credentials: true
  }

  csrf {
    enabled: true
  }

  rate_limit {
    window: 60
    max: 100
  }

  csp {
    default_src: ["self"]
    script_src: ["self", "https://cdn.tailwindcss.com"]
    style_src: ["self", "unsafe-inline"]
    img_src: ["self", "data:", "https:"]
    connect_src: ["self"]
  }
}

auth {
  secret: env("AUTH_SECRET")
  token_expires: 900
  refresh_expires: 604800
  storage: "cookie"

  provider email {
    confirm_email: true
    password_min: 8
    max_attempts: 5
    lockout_duration: 900
  }

  on signup fn(user) {
    print("New user signed up: " + user.email)
  }

  on login fn(user) {
    print("User logged in: " + user.email)
  }

  on logout fn(user) {
    print("User logged out: " + user.id)
  }

  protected_route "/dashboard" { redirect: "/login" }
  protected_route "/profile/*" { redirect: "/login" }
}

server {
  // Auth endpoints (signup, login, logout, etc.) are generated automatically
  fn health_check() {
    { status: "ok" }
  }

  route GET "/api/health" => health_check
}

browser {
  // \u2500\u2500\u2500 Navigation bar with auth-aware links \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component NavBar {
    <nav class="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" class="flex items-center gap-2 no-underline">
          <div class="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-sm">"T"</span>
          </div>
          <span class="font-bold text-gray-900 text-lg">"${name}"</span>
        </Link>
        <div class="flex items-center gap-4">
          <Link href="/" exactActiveClass="text-emerald-600 font-semibold" class="text-sm font-medium text-gray-500 hover:text-gray-900 no-underline">"Home"</Link>
          if $isAuthenticated {
            <Link href="/dashboard" activeClass="text-emerald-600 font-semibold" class="text-sm font-medium text-gray-500 hover:text-gray-900 no-underline">"Dashboard"</Link>
            <Link href="/profile" activeClass="text-emerald-600 font-semibold" class="text-sm font-medium text-gray-500 hover:text-gray-900 no-underline">"Profile"</Link>
            <div class="flex items-center gap-3 ml-2 pl-4 border-l border-gray-200">
              <span class="text-sm text-gray-500">
                if $currentUser != null {
                  {$currentUser.email}
                }
              </span>
              <button
                on:click={fn() { logout() }}
                class="text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                "Sign Out"
              </button>
            </div>
          } else {
            <Link href="/login" class="text-sm font-medium text-gray-500 hover:text-gray-900 no-underline">"Login"</Link>
            <Link href="/signup" class="text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-lg no-underline transition-colors">"Sign Up"</Link>
          }
        </div>
      </div>
    </nav>
  }

  // \u2500\u2500\u2500 Home page \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component HomePage {
    <div class="max-w-5xl mx-auto px-6 py-16 text-center">
      <div class="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
        <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
        "Secure SPA"
      </div>
      <h1 class="text-4xl font-bold text-gray-900 mb-4">"Welcome to " <span class="text-emerald-600">"${name}"</span></h1>
      <p class="text-lg text-gray-500 mb-8">"A single-page app with authentication, nested routes, and dynamic params."</p>
      if $isAuthenticated {
        <Link href="/dashboard" class="inline-block bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors no-underline">"Go to Dashboard"</Link>
      } else {
        <div class="flex items-center justify-center gap-4">
          <Link href="/signup" class="inline-block bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors no-underline">"Get Started"</Link>
          <Link href="/login" class="inline-block bg-white text-gray-700 border border-gray-200 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors no-underline">"Sign In"</Link>
        </div>
      }
    </div>
  }

  // \u2500\u2500\u2500 Auth Pages \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component LoginPage {
    <main class="max-w-md mx-auto px-6 py-16">
      <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">"Sign In"</h2>
      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <LoginForm />
        <div class="mt-6 text-center">
          <Link href="/forgot-password" class="text-sm text-emerald-600 hover:text-emerald-700 no-underline">"Forgot your password?"</Link>
        </div>
        <div class="mt-4 text-center">
          <span class="text-sm text-gray-500">"Don't have an account? "</span>
          <Link href="/signup" class="text-sm text-emerald-600 hover:text-emerald-700 font-medium no-underline">"Sign Up"</Link>
        </div>
      </div>
    </main>
  }

  component SignupPage {
    <main class="max-w-md mx-auto px-6 py-16">
      <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">"Create Account"</h2>
      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <SignupForm />
        <div class="mt-4 text-center">
          <span class="text-sm text-gray-500">"Already have an account? "</span>
          <Link href="/login" class="text-sm text-emerald-600 hover:text-emerald-700 font-medium no-underline">"Sign In"</Link>
        </div>
      </div>
    </main>
  }

  component ForgotPasswordPage {
    <main class="max-w-md mx-auto px-6 py-16">
      <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">"Reset Password"</h2>
      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <ForgotPasswordForm />
        <div class="mt-4 text-center">
          <Link href="/login" class="text-sm text-emerald-600 hover:text-emerald-700 no-underline">"Back to login"</Link>
        </div>
      </div>
    </main>
  }

  // \u2500\u2500\u2500 Dashboard (protected) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component DashboardPage {
    <AuthGuard redirect="/login">
      <main class="max-w-5xl mx-auto px-6 py-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-2">"Dashboard"</h2>
        <p class="text-gray-500 mb-8">
          "Welcome back"
          if $currentUser != null {
            ", " "{$currentUser.email}"
          }
        </p>
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <p class="text-gray-600">"This is a protected page. Only authenticated users can see this."</p>
        </div>
      </main>
    </AuthGuard>
  }

  // \u2500\u2500\u2500 Profile layout with nested routes + Outlet \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component ProfileLayout {
    <AuthGuard redirect="/login">
      <div class="max-w-5xl mx-auto px-6 py-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">"Profile"</h2>
        <div class="flex gap-8">
          <aside class="w-48 flex-shrink-0">
            <div class="flex flex-col gap-1">
              <Link href="/profile/account" activeClass="bg-emerald-50 text-emerald-700" class="block px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 no-underline transition-colors">"Account"</Link>
              <Link href="/profile/security" activeClass="bg-emerald-50 text-emerald-700" class="block px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 no-underline transition-colors">"Security"</Link>
            </div>
          </aside>
          <div class="flex-1 min-w-0">
            <Outlet />
          </div>
        </div>
      </div>
    </AuthGuard>
  }

  component AccountSettings {
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">"Account Settings"</h3>
      if $currentUser != null {
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">"Email"</label>
            <div class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">{$currentUser.email}</div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">"Role"</label>
            <div class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">{$currentUser.role}</div>
          </div>
        </div>
      }
    </div>
  }

  component SecuritySettings {
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">"Security Settings"</h3>
      <p class="text-gray-600 mb-4">"Manage your password and security preferences."</p>
      <div class="pt-4 border-t border-gray-100">
        <Link href="/forgot-password" class="text-sm text-emerald-600 hover:text-emerald-700 font-medium no-underline">"Change Password"</Link>
      </div>
    </div>
  }

  // \u2500\u2500\u2500 404 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component NotFoundPage {
    <div class="max-w-5xl mx-auto px-6 py-16 text-center">
      <h1 class="text-6xl font-bold text-gray-200 mb-4">"404"</h1>
      <p class="text-lg text-gray-500 mb-6">"Page not found"</p>
      <Link href="/" class="text-emerald-600 hover:text-emerald-700 font-medium no-underline">"Go home"</Link>
    </div>
  }

  // \u2500\u2500\u2500 Router \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  createRouter({
    routes: {
      "/": HomePage,
      "/login": LoginPage,
      "/signup": SignupPage,
      "/forgot-password": ForgotPasswordPage,
      "/dashboard": { component: DashboardPage, meta: { title: "Dashboard" } },
      "/profile": {
        component: ProfileLayout,
        children: {
          "/account": { component: AccountSettings, meta: { title: "Account" } },
          "/security": { component: SecuritySettings, meta: { title: "Security" } },
        },
      },
      "404": NotFoundPage,
    },
    scroll: "auto",
  })

  // \u2500\u2500\u2500 Update document title from route meta \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  afterNavigate(fn(current) {
    if current.meta != undefined {
      if current.meta.title != undefined {
        document.title = "{current.meta.title} | ${name}"
      }
    }
  })

  component App {
    <div class="min-h-screen bg-gray-50">
      <NavBar />
      <Router />
    </div>
  }
}
`;
}

const PROJECT_TEMPLATES = {
  fullstack: {
    label: 'Full-stack app',
    description: 'server + browser + shared blocks',
    tomlDescription: 'A full-stack Tova application',
    entry: 'src',
    file: 'src/app.tova',
    content: name => `// ${name} — Built with Tova
// Full-stack app: server RPC + client-side routing

shared {
  type Message {
    text: String
    timestamp: String
  }
}

security {
  cors {
    origins: ["http://localhost:3000"]
    methods: ["GET", "POST"]
  }
}

server {
  fn get_message() {
    Message("Hello from Tova!", Date.new().toLocaleTimeString())
  }

  route GET "/api/message" => get_message
}

browser {
  state message = ""
  state timestamp = ""
  state refreshing = false

  effect {
    result = server.get_message()
    message = result.text
    timestamp = result.timestamp
  }

  fn handle_refresh() {
    refreshing = true
    result = server.get_message()
    message = result.text
    timestamp = result.timestamp
    refreshing = false
  }

  // \u2500\u2500\u2500 Navigation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component NavBar {
    <nav class="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" class="flex items-center gap-2 no-underline">
          <div class="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg"></div>
          <span class="font-bold text-gray-900 text-lg">"${name}"</span>
        </Link>
        <div class="flex items-center gap-6">
          <Link href="/" exactActiveClass="text-indigo-600 font-semibold" class="text-sm font-medium transition-colors text-gray-500 hover:text-gray-900 no-underline">"Home"</Link>
          <Link href="/about" activeClass="text-indigo-600 font-semibold" class="text-sm font-medium transition-colors text-gray-500 hover:text-gray-900 no-underline">"About"</Link>
        </div>
      </div>
    </nav>
  }

  // \u2500\u2500\u2500 Pages \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component FeatureCard(icon, title, description) {
    <div class="group relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-indigo-100 transition-all duration-300">
      <div class="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-lg mb-4 group-hover:bg-indigo-100 transition-colors">
        "{icon}"
      </div>
      <h3 class="font-semibold text-gray-900 mb-1">"{title}"</h3>
      <p class="text-sm text-gray-500 leading-relaxed">"{description}"</p>
    </div>
  }

  component HomePage {
    <main class="max-w-5xl mx-auto px-6">
      <div class="py-20 text-center">
        <div class="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
          "Powered by Tova"
        </div>
        <h1 class="text-5xl font-bold text-gray-900 tracking-tight mb-4">"Welcome to " <span class="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">"${name}"</span></h1>
        <p class="text-xl text-gray-500 max-w-2xl mx-auto mb-10">"A modern full-stack app. Edit " <code class="text-sm bg-gray-100 text-indigo-600 px-2 py-1 rounded-md font-mono">"src/app.tova"</code> " to get started."</p>

        <div class="inline-flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-2 shadow-sm">
          <div class="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-5 py-2.5 rounded-xl font-medium">
            "{message}"
          </div>
          <button
            on:click={handle_refresh}
            class="px-4 py-2.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all font-medium text-sm"
          >
            if refreshing {
              "..."
            } else {
              "Refresh"
            }
          </button>
        </div>
        if timestamp != "" {
          <p class="text-xs text-gray-400 mt-3">"Last fetched at " "{timestamp}"</p>
        }
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 pb-20">
        <FeatureCard
          icon="\u2699"
          title="Full-Stack"
          description="Server and client in one file. Shared types, RPC calls, and reactive UI \u2014 all type-safe."
        />
        <FeatureCard
          icon="\u26A1"
          title="Fast Refresh"
          description="Edit your code and see changes instantly. The dev server recompiles on save."
        />
        <FeatureCard
          icon="\uD83C\uDFA8"
          title="Tailwind Built-in"
          description="Style with utility classes out of the box. No config or build step needed."
        />
      </div>
    </main>
  }

  component AboutPage {
    <main class="max-w-5xl mx-auto px-6 py-12">
      <h2 class="text-3xl font-bold text-gray-900 mb-6">"About"</h2>
      <div class="bg-white rounded-xl border border-gray-200 p-8 space-y-4">
        <p class="text-gray-600 leading-relaxed">"${name} is a full-stack application built with Tova \u2014 a modern language that compiles to JavaScript."</p>
        <p class="text-gray-600 leading-relaxed">"It uses shared types between server and browser, server-side RPC, and client-side routing."</p>
      </div>
      <div class="mt-8">
        <Link href="/" class="text-indigo-600 hover:text-indigo-700 font-medium no-underline">"\u2190 Back to home"</Link>
      </div>
    </main>
  }

  component NotFoundPage {
    <div class="max-w-5xl mx-auto px-6 py-16 text-center">
      <h1 class="text-6xl font-bold text-gray-200 mb-4">"404"</h1>
      <p class="text-lg text-gray-500 mb-6">"Page not found"</p>
      <Link href="/" class="text-indigo-600 hover:text-indigo-700 font-medium no-underline">"Go home"</Link>
    </div>
  }

  // \u2500\u2500\u2500 Router setup \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  createRouter({
    routes: {
      "/": HomePage,
      "/about": { component: AboutPage, meta: { title: "About" } },
      "404": NotFoundPage,
    },
    scroll: "auto",
  })

  component App {
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <NavBar />
      <Router />
      <div class="border-t border-gray-100 py-8 text-center">
        <p class="text-sm text-gray-400">"Built with " <a href="https://github.com/tova-lang/tova-lang" class="text-indigo-500 hover:text-indigo-600 transition-colors">"Tova"</a></p>
      </div>
    </div>
  }
}
`,
    nextSteps: name => `    cd ${name}\n    tova dev`,
    hasAuthOption: true,
    authContent: fullstackAuthContent,
    authNextSteps: name => `    cd ${name}\n    tova dev\n\n  ${color.dim('Auth is ready! Sign up at')} ${color.cyan('http://localhost:3000/signup')}`,
  },
  spa: {
    label: 'Single-page app',
    description: 'browser-only app with routing',
    tomlDescription: 'A Tova single-page application',
    entry: 'src',
    file: 'src/app.tova',
    content: name => `// ${name} — Built with Tova
// Demonstrates: createRouter, Link, Router, Outlet, navigate(),
// dynamic :param routes, nested routes, route meta, 404 handling

browser {
  // \u2500\u2500\u2500 Navigation bar with active link highlighting \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component NavBar {
    <nav class="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" class="flex items-center gap-2 no-underline">
          <div class="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg"></div>
          <span class="font-bold text-gray-900 text-lg">"${name}"</span>
        </Link>
        <div class="flex items-center gap-6">
          <Link href="/" exactActiveClass="text-indigo-600 font-semibold" class="text-sm font-medium transition-colors text-gray-500 hover:text-gray-900">"Home"</Link>
          <Link href="/users" activeClass="text-indigo-600 font-semibold" class="text-sm font-medium transition-colors text-gray-500 hover:text-gray-900">"Users"</Link>
          <Link href="/settings" activeClass="text-indigo-600 font-semibold" class="text-sm font-medium transition-colors text-gray-500 hover:text-gray-900">"Settings"</Link>
        </div>
      </div>
    </nav>
  }

  // \u2500\u2500\u2500 Home page \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component HomePage {
    <div class="max-w-5xl mx-auto px-6 py-16 text-center">
      <div class="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
        <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
        "Tova Router"
      </div>
      <h1 class="text-4xl font-bold text-gray-900 mb-4">"Welcome to " <span class="text-indigo-600">"${name}"</span></h1>
      <p class="text-lg text-gray-500 mb-8">"A single-page app with client-side routing. Click around to explore."</p>
      <div class="flex items-center justify-center gap-4">
        <Link href="/users" class="inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors no-underline">"Browse Users"</Link>
        <Link href="/settings/profile" class="inline-block bg-white text-gray-700 border border-gray-200 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors no-underline">"Settings"</Link>
      </div>
    </div>
  }

  // \u2500\u2500\u2500 Users list (demonstrates programmatic navigation) \u2500\u2500\u2500\u2500
  fn go_to_user(uid) {
    navigate("/users/{uid}")
  }

  component UsersPage {
    <div class="max-w-5xl mx-auto px-6 py-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">"Users"</h2>
      <div class="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div class="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors" on:click={fn() go_to_user("1")}>
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-semibold text-sm">"A"</div>
            <div>
              <p class="font-medium text-gray-900">"alice"</p>
              <p class="text-xs text-gray-500">"Admin"</p>
            </div>
          </div>
          <span class="text-gray-400 text-sm">"View \u2192"</span>
        </div>
        <div class="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors" on:click={fn() go_to_user("2")}>
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-semibold text-sm">"B"</div>
            <div>
              <p class="font-medium text-gray-900">"bob"</p>
              <p class="text-xs text-gray-500">"Editor"</p>
            </div>
          </div>
          <span class="text-gray-400 text-sm">"View \u2192"</span>
        </div>
        <div class="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors" on:click={fn() go_to_user("3")}>
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-semibold text-sm">"C"</div>
            <div>
              <p class="font-medium text-gray-900">"charlie"</p>
              <p class="text-xs text-gray-500">"Viewer"</p>
            </div>
          </div>
          <span class="text-gray-400 text-sm">"View \u2192"</span>
        </div>
      </div>
    </div>
  }

  // \u2500\u2500\u2500 User detail (demonstrates :id dynamic route param) \u2500\u2500\u2500
  component UserPage(id) {
    <div class="max-w-5xl mx-auto px-6 py-12">
      <button on:click={fn() navigate("/users")} class="text-sm text-indigo-600 hover:text-indigo-700 mb-6 inline-flex items-center gap-1 cursor-pointer bg-transparent border-0">
        "\u2190 Back to users"
      </button>
      <div class="bg-white rounded-xl border border-gray-200 p-8">
        <div class="flex items-center gap-4 mb-6">
          <div class="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xl">
            "#{id}"
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900">"User {id}"</h2>
            <span class="text-sm text-gray-500">"Dynamic route parameter: " <code class="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-xs">":id = {id}"</code></span>
          </div>
        </div>
        <p class="text-gray-600">"This page receives " <code class="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-xs">"id"</code> " from the route " <code class="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-xs">"/users/:id"</code> " pattern."</p>
      </div>
    </div>
  }

  // \u2500\u2500\u2500 Settings layout with nested routes + Outlet \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component SettingsLayout {
    <div class="max-w-5xl mx-auto px-6 py-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">"Settings"</h2>
      <div class="flex gap-8">
        <aside class="w-48 flex-shrink-0">
          <div class="flex flex-col gap-1">
            <Link href="/settings/profile" activeClass="bg-indigo-50 text-indigo-700" class="block px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 no-underline transition-colors">"Profile"</Link>
            <Link href="/settings/account" activeClass="bg-indigo-50 text-indigo-700" class="block px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 no-underline transition-colors">"Account"</Link>
          </div>
        </aside>
        <div class="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  }

  component ProfileSettings {
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">"Profile Settings"</h3>
      <p class="text-gray-600 mb-4">"This is a nested child route rendered via " <code class="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-xs">"Outlet"</code> " inside SettingsLayout."</p>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">"Display Name"</label>
          <div class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">"Alice"</div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">"Bio"</label>
          <div class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500">"Tova developer"</div>
        </div>
      </div>
    </div>
  }

  component AccountSettings {
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">"Account Settings"</h3>
      <p class="text-gray-600 mb-4">"Another nested child of " <code class="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-xs">"/settings"</code> "."</p>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">"Email"</label>
          <div class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">"alice@example.com"</div>
        </div>
        <div class="pt-4 border-t border-gray-100">
          <button class="text-sm text-red-600 hover:text-red-700 font-medium cursor-pointer bg-transparent border-0">"Delete Account"</button>
        </div>
      </div>
    </div>
  }

  // \u2500\u2500\u2500 404 page \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  component NotFoundPage {
    <div class="max-w-5xl mx-auto px-6 py-16 text-center">
      <h1 class="text-6xl font-bold text-gray-200 mb-4">"404"</h1>
      <p class="text-lg text-gray-500 mb-6">"Page not found"</p>
      <Link href="/" class="text-indigo-600 hover:text-indigo-700 font-medium no-underline">"Go home"</Link>
    </div>
  }

  // \u2500\u2500\u2500 Router setup \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  createRouter({
    routes: {
      "/": HomePage,
      "/users": { component: UsersPage, meta: { title: "Users" } },
      "/users/:id": { component: UserPage, meta: { title: "User Detail" } },
      "/settings": {
        component: SettingsLayout,
        children: {
          "/profile": { component: ProfileSettings, meta: { title: "Profile" } },
          "/account": { component: AccountSettings, meta: { title: "Account" } },
        },
      },
      "404": NotFoundPage,
    },
    scroll: "auto",
  })

  // \u2500\u2500\u2500 Update document title from route meta \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  afterNavigate(fn(current) {
    if current.meta != undefined {
      if current.meta.title != undefined {
        document.title = "{current.meta.title} | ${name}"
      }
    }
  })

  component App {
    <div class="min-h-screen bg-gray-50">
      <NavBar />
      <Router />
    </div>
  }
}
`,
    nextSteps: name => `    cd ${name}\n    tova dev`,
    hasAuthOption: true,
    authContent: spaAuthContent,
    authNextSteps: name => `    cd ${name}\n    tova dev\n\n  ${color.dim('Auth is ready! Sign up at')} ${color.cyan('http://localhost:3000/signup')}`,
  },
  site: {
    label: 'Static site',
    description: 'docs or marketing site with pages',
    tomlDescription: 'A Tova static site',
    entry: 'src',
    file: 'src/app.tova',
    extraFiles: [
      {
        path: 'src/pages/home.tova',
        content: name => `pub component HomePage {
  <div class="max-w-4xl mx-auto px-6 py-16">
    <h1 class="text-4xl font-bold text-gray-900 mb-4">"Welcome to ${name}"</h1>
    <p class="text-lg text-gray-600 mb-8">"A static site built with Tova. Fast, simple, and easy to deploy anywhere."</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-900 mb-2">"Fast by default"</h3>
        <p class="text-gray-500 text-sm">"Client-side routing for smooth, instant navigation between pages."</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-900 mb-2">"Deploy anywhere"</h3>
        <p class="text-gray-500 text-sm">"GitHub Pages, Netlify, Vercel, Firebase \u2014 works with any static host."</p>
      </div>
    </div>
  </div>
}
`,
      },
      {
        path: 'src/pages/docs.tova',
        content: name => `pub component DocsPage {
  <div class="max-w-4xl mx-auto px-6 py-12">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">"Documentation"</h1>
    <div class="prose">
      <h2 class="text-xl font-semibold text-gray-900 mt-8 mb-3">"Getting Started"</h2>
      <p class="text-gray-600 mb-4">"Add your documentation content here. Each page is a Tova component with its own route."</p>
      <h2 class="text-xl font-semibold text-gray-900 mt-8 mb-3">"Adding Pages"</h2>
      <p class="text-gray-600 mb-4">"Create a new file in " <code class="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-sm">"src/pages/"</code> " and add a route in " <code class="bg-gray-100 text-indigo-600 px-1.5 py-0.5 rounded text-sm">"src/app.tova"</code> "."</p>
    </div>
  </div>
}
`,
      },
      {
        path: 'src/pages/about.tova',
        content: name => `pub component AboutPage {
  <div class="max-w-4xl mx-auto px-6 py-12">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">"About"</h1>
    <p class="text-gray-600">"This site was built with Tova \u2014 a modern programming language that compiles to JavaScript."</p>
  </div>
}
`,
      },
    ],
    content: name => `// ${name} — Built with Tova
import { HomePage } from "./pages/home"
import { DocsPage } from "./pages/docs"
import { AboutPage } from "./pages/about"

browser {
  component SiteNav {
    <header class="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" class="flex items-center gap-2 no-underline">
          <div class="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg"></div>
          <span class="font-bold text-gray-900">"${name}"</span>
        </Link>
        <nav class="flex items-center gap-6">
          <Link href="/" exactActiveClass="text-indigo-600 font-semibold" class="text-sm font-medium transition-colors no-underline text-gray-500 hover:text-gray-900">"Home"</Link>
          <Link href="/docs" activeClass="text-indigo-600 font-semibold" class="text-sm font-medium transition-colors no-underline text-gray-500 hover:text-gray-900">"Docs"</Link>
          <Link href="/about" activeClass="text-indigo-600 font-semibold" class="text-sm font-medium transition-colors no-underline text-gray-500 hover:text-gray-900">"About"</Link>
        </nav>
      </div>
    </header>
  }

  component NotFoundPage {
    <div class="max-w-4xl mx-auto px-6 py-16 text-center">
      <h1 class="text-6xl font-bold text-gray-200 mb-4">"404"</h1>
      <p class="text-lg text-gray-500 mb-6">"Page not found"</p>
      <Link href="/" class="text-indigo-600 hover:text-indigo-700 font-medium no-underline">"Go home"</Link>
    </div>
  }

  createRouter({
    routes: {
      "/": HomePage,
      "/docs": { component: DocsPage, meta: { title: "Documentation" } },
      "/about": { component: AboutPage, meta: { title: "About" } },
      "404": NotFoundPage,
    },
    scroll: "auto",
  })

  // Update document title from route meta
  afterNavigate(fn(current) {
    if current.meta != undefined {
      if current.meta.title != undefined {
        document.title = "{current.meta.title} | ${name}"
      }
    }
  })

  component App {
    <div class="min-h-screen bg-gray-50">
      <SiteNav />
      <main>
        <Router />
      </main>
      <footer class="border-t border-gray-100 py-8 text-center">
        <p class="text-sm text-gray-400">"Built with Tova"</p>
      </footer>
    </div>
  }
}
`,
    nextSteps: name => `    cd ${name}\n    tova dev`,
  },
  api: {
    label: 'API server',
    description: 'HTTP routes, no frontend',
    tomlDescription: 'A Tova API server',
    entry: 'src',
    file: 'src/app.tova',
    content: name => `// ${name} — Built with Tova

security {
  cors {
    origins: ["http://localhost:3000"]
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
}

server {
  fn health() {
    { status: "ok" }
  }

  route GET "/api/health" => health
}
`,
    nextSteps: name => `    cd ${name}\n    tova dev`,
  },
  script: {
    label: 'Script',
    description: 'standalone .tova script',
    tomlDescription: 'A Tova script',
    entry: 'src',
    file: 'src/main.tova',
    content: name => `// ${name} — Built with Tova

name = "world"
print("Hello, {name}!")
`,
    nextSteps: name => `    cd ${name}\n    tova run src/main.tova`,
  },
  library: {
    label: 'Library',
    description: 'reusable module with exports',
    tomlDescription: 'A Tova library',
    entry: 'src',
    noEntry: true,
    isPackage: true,
    file: 'src/lib.tova',
    content: name => `// ${name} — A Tova library
//
// Usage:
//   import { greet } from "github.com/yourname/${name}"

pub fn greet(name: String) -> String {
  "Hello, {name}!"
}

pub fn version() -> String {
  "0.1.0"
}
`,
    nextSteps: name => `    cd ${name}\n    tova build`,
  },
  blank: {
    label: 'Blank',
    description: 'empty project skeleton',
    tomlDescription: 'A Tova project',
    entry: 'src',
    file: null,
    content: null,
    nextSteps: name => `    cd ${name}`,
  },
};

const TEMPLATE_ORDER = ['fullstack', 'spa', 'site', 'api', 'script', 'library', 'blank'];

async function newProject(rawArgs) {
  const name = rawArgs.find(a => !a.startsWith('-'));
  const templateFlag = rawArgs.find(a => a.startsWith('--template'));
  let templateName = null;
  if (templateFlag) {
    const idx = rawArgs.indexOf(templateFlag);
    if (templateFlag.includes('=')) {
      templateName = templateFlag.split('=')[1];
    } else {
      templateName = rawArgs[idx + 1];
    }
  }

  if (!name) {
    console.error(color.red('Error: No project name specified'));
    console.error('Usage: tova new <project-name> [--template fullstack|spa|site|api|script|library|blank] [--auth]');
    process.exit(1);
  }

  const projectDir = resolve(name);
  const projectName = basename(projectDir);
  if (existsSync(projectDir)) {
    console.error(color.red(`Error: Directory '${name}' already exists`));
    process.exit(1);
  }

  // Resolve template
  if (templateName && !PROJECT_TEMPLATES[templateName]) {
    console.error(color.red(`Error: Unknown template '${templateName}'`));
    console.error(`Available templates: ${TEMPLATE_ORDER.join(', ')}`);
    process.exit(1);
  }

  if (!templateName) {
    // Interactive picker
    console.log(`\n  ${color.bold('Creating new Tova project:')} ${color.cyan(name)}\n`);
    console.log('  Pick a template:\n');
    TEMPLATE_ORDER.forEach((key, i) => {
      const t = PROJECT_TEMPLATES[key];
      const num = color.bold(`${i + 1}`);
      const label = color.cyan(t.label);
      console.log(`    ${num}. ${label}  ${color.dim('\u2014')} ${t.description}`);
    });
    console.log('');

    const { createInterface } = await import('readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question(`  Enter choice ${color.dim('[1]')}: `, ans => {
        rl.close();
        resolve(ans.trim());
      });
    });

    const choice = answer === '' ? 1 : parseInt(answer, 10);
    if (isNaN(choice) || choice < 1 || choice > TEMPLATE_ORDER.length) {
      console.error(color.red(`\n  Invalid choice. Please enter a number 1-${TEMPLATE_ORDER.length}.`));
      process.exit(1);
    }
    templateName = TEMPLATE_ORDER[choice - 1];
  }

  const template = PROJECT_TEMPLATES[templateName];
  const authFlag = rawArgs.includes('--auth');

  // Ask about auth if template supports it
  // Only prompt interactively when template was selected via picker (not --template flag)
  let withAuth = false;
  if (template.hasAuthOption) {
    if (authFlag) {
      withAuth = true;
    } else if (!templateFlag) {
      // Interactive mode — template was selected via picker, so ask about auth
      const { createInterface: createRl } = await import('readline');
      const rl2 = createRl({ input: process.stdin, output: process.stdout });
      const authAnswer = await new Promise(resolve => {
        rl2.question(`  Include authentication? ${color.dim('[y/N]')}: `, ans => {
          rl2.close();
          resolve(ans.trim().toLowerCase());
        });
      });
      withAuth = authAnswer === 'y' || authAnswer === 'yes';
    }
  }

  const templateLabel = withAuth ? `${template.label} + Auth` : template.label;
  console.log(`\n  ${color.bold('Creating new Tova project:')} ${color.cyan(name)} ${color.dim(`(${templateLabel})`)}\n`);

  // Create directories
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, 'src'));

  const createdFiles = [];

  // tova.toml
  let tomlContent;
  if (template.isPackage) {
    // Library packages use [package] section per package management design
    tomlContent = [
      '[package]',
      `name = "github.com/yourname/${projectName}"`,
      `version = "0.1.0"`,
      `description = "${template.tomlDescription}"`,
      `license = "MIT"`,
      `exports = ["greet", "version"]`,
      '',
      '[build]',
      'output = ".tova-out"',
      '',
      '[dependencies]',
      '',
      '[npm]',
      '',
    ].join('\n') + '\n';
  } else {
    const tomlConfig = {
      project: {
        name: projectName,
        version: '0.1.0',
        description: template.tomlDescription,
      },
      build: {
        output: '.tova-out',
      },
    };
    if (!template.noEntry) {
      tomlConfig.project.entry = template.entry;
    }
    if (templateName === 'fullstack' || templateName === 'api' || templateName === 'spa' || templateName === 'site') {
      tomlConfig.dev = { port: 3000 };
      tomlConfig.npm = {};
    }
    if (templateName === 'spa' || templateName === 'site') {
      tomlConfig.deploy = { base: '/' };
    }
    tomlContent = stringifyTOML(tomlConfig);
  }
  writeFileSync(join(projectDir, 'tova.toml'), tomlContent);
  createdFiles.push('tova.toml');

  // .gitignore
  let gitignoreContent = `node_modules/
.tova-out/
package.json
bun.lock
*.db
*.db-shm
*.db-wal
`;
  if (withAuth) gitignoreContent += `.env\n`;
  writeFileSync(join(projectDir, '.gitignore'), gitignoreContent);
  createdFiles.push('.gitignore');

  // Template source file
  const contentFn = withAuth && template.authContent ? template.authContent : template.content;
  if (template.file && contentFn) {
    writeFileSync(join(projectDir, template.file), contentFn(projectName));
    createdFiles.push(template.file);
  }

  // Extra files (e.g., page components for site template)
  if (template.extraFiles) {
    for (const extra of template.extraFiles) {
      const extraPath = join(projectDir, extra.path);
      mkdirSync(dirname(extraPath), { recursive: true });
      writeFileSync(extraPath, extra.content(projectName));
      createdFiles.push(extra.path);
    }
  }

  // Auth files (.env + .env.example)
  if (withAuth) {
    const { randomBytes } = await import('crypto');
    const authSecret = randomBytes(32).toString('hex');
    writeFileSync(join(projectDir, '.env'), `# Auto-generated for development \u2014 do not commit this file\nAUTH_SECRET=${authSecret}\n`);
    writeFileSync(join(projectDir, '.env.example'), `# Auth secret \u2014 used to sign JWT tokens\n# For production, generate a new one:\n#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\nAUTH_SECRET=change-me-to-a-random-secret\n`);
    createdFiles.push('.env');
    createdFiles.push('.env.example');
  }

  // README
  let readmeContent = `# ${projectName}

Built with [Tova](https://github.com/tova-lang/tova-lang) \u2014 a modern full-stack language.

## Getting started

\`\`\`bash
${template.nextSteps(name).trim()}
\`\`\`
`;
  if (template.isPackage) {
    readmeContent += `
## Usage

\`\`\`tova
import { greet } from "github.com/yourname/${projectName}"

print(greet("world"))
\`\`\`

## Publishing

Tag a release and push \u2014 no registry needed:

\`\`\`bash
git tag v0.1.0
git push origin v0.1.0
\`\`\`

Others can then add your package:

\`\`\`bash
tova add github.com/yourname/${projectName}
\`\`\`
`;
  }
  writeFileSync(join(projectDir, 'README.md'), readmeContent);
  createdFiles.push('README.md');

  // Print created files
  for (const f of createdFiles) {
    console.log(`  ${color.green('\u2713')} Created ${color.bold(name + '/' + f)}`);
  }

  // git init (silent, only if git is available)
  try {
    const gitProc = _compatSpawnSync('git', ['init'], { cwd: projectDir, stdout: 'pipe', stderr: 'pipe' });
    if ((gitProc.exitCode ?? gitProc.status) === 0) {
      console.log(`  ${color.green('\u2713')} Initialized git repository`);
    }
  } catch {}

  console.log(`\n  ${color.green('Done!')} Next steps:\n`);
  const nextStepsFn = withAuth && template.authNextSteps ? template.authNextSteps : template.nextSteps;
  console.log(nextStepsFn(name));
  console.log('');
}

export { newProject };
