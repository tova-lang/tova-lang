// CLI-specific AST Node definitions for the Tova language
// Extracted for lazy loading — only loaded when cli { } blocks are used.

export class CliConfigField {
  constructor(key, value, loc) {
    this.type = 'CliConfigField';
    this.key = key;       // string — "name", "version", "description"
    this.value = value;   // Expression (StringLiteral, etc.)
    this.loc = loc;
  }
}

export class CliCommandDeclaration {
  constructor(name, params, body, isAsync, loc) {
    this.type = 'CliCommandDeclaration';
    this.name = name;       // string — command name
    this.params = params;   // Array of CliParam
    this.body = body;       // BlockStatement
    this.isAsync = isAsync; // boolean
    this.loc = loc;
  }
}

export class CliParam {
  constructor(name, typeAnnotation, defaultValue, isFlag, isOptional, isRepeated, loc) {
    this.type = 'CliParam';
    this.name = name;               // string — parameter name
    this.typeAnnotation = typeAnnotation; // string or null — "String", "Int", "Float", "Bool"
    this.defaultValue = defaultValue;     // Expression or null
    this.isFlag = isFlag;           // boolean — prefixed with --
    this.isOptional = isOptional;   // boolean — Type? suffix
    this.isRepeated = isRepeated;   // boolean — [Type] array flag
    this.loc = loc;
  }
}
