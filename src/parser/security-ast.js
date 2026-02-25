// Security-specific AST Node definitions for the Tova language
// Extracted for lazy loading — only loaded when security { } blocks are used.

export class SecurityAuthDeclaration {
  constructor(authType, config, loc) {
    this.type = 'SecurityAuthDeclaration';
    this.authType = authType; // "jwt" or "api_key"
    this.config = config;     // { secret, expires, ... }
    this.loc = loc;
  }
}

export class SecurityRoleDeclaration {
  constructor(name, permissions, loc) {
    this.type = 'SecurityRoleDeclaration';
    this.name = name;           // string — role name, e.g. "Admin"
    this.permissions = permissions; // Array of strings — permission names
    this.loc = loc;
  }
}

export class SecurityProtectDeclaration {
  constructor(pattern, config, loc) {
    this.type = 'SecurityProtectDeclaration';
    this.pattern = pattern;     // string — route pattern, e.g. "/api/admin/*"
    this.config = config;       // { require, rate_limit: { max, window } }
    this.loc = loc;
  }
}

export class SecuritySensitiveDeclaration {
  constructor(typeName, fieldName, config, loc) {
    this.type = 'SecuritySensitiveDeclaration';
    this.typeName = typeName;   // string — type name, e.g. "User"
    this.fieldName = fieldName; // string — field name, e.g. "password"
    this.config = config;       // { hash, never_expose, visible_to }
    this.loc = loc;
  }
}

export class SecurityCorsDeclaration {
  constructor(config, loc) {
    this.type = 'SecurityCorsDeclaration';
    this.config = config;       // { origins, methods, credentials }
    this.loc = loc;
  }
}

export class SecurityCspDeclaration {
  constructor(config, loc) {
    this.type = 'SecurityCspDeclaration';
    this.config = config;       // { default_src, script_src, style_src, ... }
    this.loc = loc;
  }
}

export class SecurityRateLimitDeclaration {
  constructor(config, loc) {
    this.type = 'SecurityRateLimitDeclaration';
    this.config = config;       // { max, window }
    this.loc = loc;
  }
}

export class SecurityCsrfDeclaration {
  constructor(config, loc) {
    this.type = 'SecurityCsrfDeclaration';
    this.config = config;       // { enabled, exempt }
    this.loc = loc;
  }
}

export class SecurityAuditDeclaration {
  constructor(config, loc) {
    this.type = 'SecurityAuditDeclaration';
    this.config = config;       // { events, store, retain }
    this.loc = loc;
  }
}

export class SecurityTrustProxyDeclaration {
  constructor(value, loc) {
    this.type = 'SecurityTrustProxyDeclaration';
    this.value = value;         // true | false | "loopback"
    this.loc = loc;
  }
}

export class SecurityHstsDeclaration {
  constructor(config, loc) {
    this.type = 'SecurityHstsDeclaration';
    this.config = config;       // { enabled, max_age, include_subdomains, preload }
    this.loc = loc;
  }
}
