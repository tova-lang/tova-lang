// Auth-specific AST Node definitions for the Tova language

export class AuthConfigField {
  constructor(key, value, loc) {
    this.type = 'AuthConfigField';
    this.key = key;
    this.value = value;
    this.loc = loc;
  }
}

export class AuthProviderDeclaration {
  constructor(providerType, name, config, loc) {
    this.type = 'AuthProviderDeclaration';
    this.providerType = providerType;
    this.name = name;
    this.config = config;
    this.loc = loc;
  }
}

export class AuthHookDeclaration {
  constructor(event, handler, loc) {
    this.type = 'AuthHookDeclaration';
    this.event = event;
    this.handler = handler;
    this.loc = loc;
  }
}

export class AuthProtectedRoute {
  constructor(pattern, config, loc) {
    this.type = 'AuthProtectedRoute';
    this.pattern = pattern;
    this.config = config;
    this.loc = loc;
  }
}
