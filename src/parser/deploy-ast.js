// Deploy-specific AST Node definitions for the Tova language
// Extracted for lazy loading — only loaded when deploy { } blocks are used.

export class DeployBlock {
  constructor(body, loc, name = null) {
    this.type = 'DeployBlock';
    this.name = name;
    this.body = body;
    this.loc = loc;
  }
}

export class DeployConfigField {
  constructor(key, value, loc) {
    this.type = 'DeployConfigField';
    this.key = key;
    this.value = value;
    this.loc = loc;
  }
}

export class DeployEnvBlock {
  constructor(entries, loc) {
    this.type = 'DeployEnvBlock';
    this.entries = entries;
    this.loc = loc;
  }
}

export class DeployDbBlock {
  constructor(engine, config, loc) {
    this.type = 'DeployDbBlock';
    this.engine = engine;
    this.config = config;
    this.loc = loc;
  }
}
