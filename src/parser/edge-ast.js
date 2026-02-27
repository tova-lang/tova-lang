// Edge/serverless-specific AST Node definitions for the Tova language
// Extracted for lazy loading — only loaded when edge { } blocks are used.

export class EdgeConfigField {
  constructor(key, value, loc) {
    this.type = 'EdgeConfigField';
    this.key = key;       // string — "target", "name", etc.
    this.value = value;   // Expression (StringLiteral, etc.)
    this.loc = loc;
  }
}

export class EdgeKVDeclaration {
  constructor(name, config, loc) {
    this.type = 'EdgeKVDeclaration';
    this.name = name;       // string — binding name (e.g., "CACHE")
    this.config = config;   // object or null — { ttl: Expression } etc.
    this.loc = loc;
  }
}

export class EdgeSQLDeclaration {
  constructor(name, config, loc) {
    this.type = 'EdgeSQLDeclaration';
    this.name = name;       // string — binding name (e.g., "DB")
    this.config = config;   // object or null
    this.loc = loc;
  }
}

export class EdgeStorageDeclaration {
  constructor(name, config, loc) {
    this.type = 'EdgeStorageDeclaration';
    this.name = name;       // string — binding name (e.g., "UPLOADS")
    this.config = config;   // object or null
    this.loc = loc;
  }
}

export class EdgeQueueDeclaration {
  constructor(name, config, loc) {
    this.type = 'EdgeQueueDeclaration';
    this.name = name;       // string — binding name (e.g., "EMAILS")
    this.config = config;   // object or null
    this.loc = loc;
  }
}

export class EdgeEnvDeclaration {
  constructor(name, defaultValue, loc) {
    this.type = 'EdgeEnvDeclaration';
    this.name = name;             // string — env var name
    this.defaultValue = defaultValue; // Expression or null
    this.loc = loc;
  }
}

export class EdgeSecretDeclaration {
  constructor(name, loc) {
    this.type = 'EdgeSecretDeclaration';
    this.name = name;       // string — secret name
    this.loc = loc;
  }
}

export class EdgeScheduleDeclaration {
  constructor(name, cron, body, loc) {
    this.type = 'EdgeScheduleDeclaration';
    this.name = name;       // string — schedule name
    this.cron = cron;       // string — cron expression
    this.body = body;       // BlockStatement
    this.loc = loc;
  }
}

export class EdgeConsumeDeclaration {
  constructor(queue, handler, loc) {
    this.type = 'EdgeConsumeDeclaration';
    this.queue = queue;     // string — queue binding name
    this.handler = handler; // FunctionDeclaration or LambdaExpression
    this.loc = loc;
  }
}
