// Server-specific AST Node definitions for the Tova language
// Extracted from ast.js for lazy loading — only loaded when server { } blocks are used.

export class RouteDeclaration {
  constructor(method, path, handler, loc, decorators = [], bodyType = null, responseType = null) {
    this.type = 'RouteDeclaration';
    this.method = method;   // GET, POST, PUT, DELETE, PATCH
    this.path = path;       // string literal
    this.handler = handler; // Identifier or FunctionDeclaration
    this.decorators = decorators; // Array of { name, args } for "with auth, role("admin")"
    this.bodyType = bodyType;       // TypeAnnotation — request body type (e.g., body: User)
    this.responseType = responseType; // TypeAnnotation — response type (e.g., -> [User])
    this.loc = loc;
  }
}

export class MiddlewareDeclaration {
  constructor(name, params, body, loc) {
    this.type = 'MiddlewareDeclaration';
    this.name = name;
    this.params = params;   // Array of Parameter nodes (req, next)
    this.body = body;       // BlockStatement
    this.loc = loc;
  }
}

export class HealthCheckDeclaration {
  constructor(path, loc, checks = []) {
    this.type = 'HealthCheckDeclaration';
    this.path = path;       // string literal, e.g. "/health"
    this.checks = checks;   // optional array of check names, e.g. ["check_memory", "check_db"]
    this.loc = loc;
  }
}

export class CorsDeclaration {
  constructor(config, loc) {
    this.type = 'CorsDeclaration';
    this.config = config;   // { origins: ArrayLiteral, methods: ArrayLiteral, headers: ArrayLiteral }
    this.loc = loc;
  }
}

export class ErrorHandlerDeclaration {
  constructor(params, body, loc) {
    this.type = 'ErrorHandlerDeclaration';
    this.params = params;   // Array of Parameter nodes (err, req)
    this.body = body;       // BlockStatement
    this.loc = loc;
  }
}

export class WebSocketDeclaration {
  constructor(handlers, loc, config = null) {
    this.type = 'WebSocketDeclaration';
    this.handlers = handlers; // { on_open, on_message, on_close, on_error } — each is { params, body } or null
    this.config = config;     // { auth: expression } or null
    this.loc = loc;
  }
}

export class StaticDeclaration {
  constructor(path, dir, loc, fallback = null) {
    this.type = 'StaticDeclaration';
    this.path = path;       // URL prefix, e.g. "/public"
    this.dir = dir;         // directory path, e.g. "./public"
    this.fallback = fallback; // fallback file, e.g. "index.html"
    this.loc = loc;
  }
}

export class DiscoverDeclaration {
  constructor(peerName, urlExpression, loc, config = null) {
    this.type = 'DiscoverDeclaration';
    this.peerName = peerName;         // string — the peer server name
    this.urlExpression = urlExpression; // Expression — the URL
    this.config = config;             // { threshold, timeout } or null
    this.loc = loc;
  }
}

export class AuthDeclaration {
  constructor(config, loc) {
    this.type = 'AuthDeclaration';
    this.config = config; // { type, secret, ... } object config
    this.loc = loc;
  }
}

export class MaxBodyDeclaration {
  constructor(limit, loc) {
    this.type = 'MaxBodyDeclaration';
    this.limit = limit; // Expression — max body size in bytes
    this.loc = loc;
  }
}

export class RouteGroupDeclaration {
  constructor(prefix, body, loc, version = null) {
    this.type = 'RouteGroupDeclaration';
    this.prefix = prefix; // string — URL prefix, e.g. "/api/v1"
    this.body = body;     // Array of server statements
    this.version = version; // version config: { version, deprecated, sunset } or null
    this.loc = loc;
  }
}

export class RateLimitDeclaration {
  constructor(config, loc) {
    this.type = 'RateLimitDeclaration';
    this.config = config;
    this.loc = loc;
  }
}

export class LifecycleHookDeclaration {
  constructor(hook, params, body, loc) {
    this.type = 'LifecycleHookDeclaration';
    this.hook = hook;       // "start" or "stop"
    this.params = params;
    this.body = body;
    this.loc = loc;
  }
}

export class SubscribeDeclaration {
  constructor(event, params, body, loc) {
    this.type = 'SubscribeDeclaration';
    this.event = event;     // string — event name
    this.params = params;
    this.body = body;
    this.loc = loc;
  }
}

export class EnvDeclaration {
  constructor(name, typeAnnotation, defaultValue, loc) {
    this.type = 'EnvDeclaration';
    this.name = name;
    this.typeAnnotation = typeAnnotation;
    this.defaultValue = defaultValue;
    this.loc = loc;
  }
}

export class ScheduleDeclaration {
  constructor(pattern, name, params, body, loc) {
    this.type = 'ScheduleDeclaration';
    this.pattern = pattern;   // string — interval or cron pattern
    this.name = name;         // optional function name
    this.params = params;
    this.body = body;
    this.loc = loc;
  }
}

export class UploadDeclaration {
  constructor(config, loc) {
    this.type = 'UploadDeclaration';
    this.config = config;   // { max_size, allowed_types, ... }
    this.loc = loc;
  }
}

export class SessionDeclaration {
  constructor(config, loc) {
    this.type = 'SessionDeclaration';
    this.config = config;   // { secret, max_age, cookie_name, ... }
    this.loc = loc;
  }
}

export class DbDeclaration {
  constructor(config, loc) {
    this.type = 'DbDeclaration';
    this.config = config;   // { path, wal, ... }
    this.loc = loc;
  }
}

export class TlsDeclaration {
  constructor(config, loc) {
    this.type = 'TlsDeclaration';
    this.config = config;   // { cert, key, ... }
    this.loc = loc;
  }
}

export class CompressionDeclaration {
  constructor(config, loc) {
    this.type = 'CompressionDeclaration';
    this.config = config;   // { enabled, min_size, ... }
    this.loc = loc;
  }
}

export class BackgroundJobDeclaration {
  constructor(name, params, body, loc) {
    this.type = 'BackgroundJobDeclaration';
    this.name = name;
    this.params = params;
    this.body = body;
    this.loc = loc;
  }
}

export class CacheDeclaration {
  constructor(config, loc) {
    this.type = 'CacheDeclaration';
    this.config = config;   // { max_age, stale_while_revalidate, ... }
    this.loc = loc;
  }
}

export class SseDeclaration {
  constructor(path, params, body, loc) {
    this.type = 'SseDeclaration';
    this.path = path;       // string — SSE endpoint path
    this.params = params;   // Array of Parameter nodes
    this.body = body;       // BlockStatement
    this.loc = loc;
  }
}

export class ModelDeclaration {
  constructor(name, config, loc) {
    this.type = 'ModelDeclaration';
    this.name = name;       // string — type name to generate CRUD for
    this.config = config;   // { table, timestamps, ... } or null
    this.loc = loc;
  }
}

export class AiConfigDeclaration {
  constructor(name, config, loc) {
    this.type = 'AiConfigDeclaration';
    this.name = name;    // optional string name (null for default)
    this.config = config; // key-value config object
    this.loc = loc;
  }
}
