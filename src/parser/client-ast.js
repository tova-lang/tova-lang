// Client-specific AST Node definitions for the Tova language
// Extracted from ast.js for lazy loading — only loaded when client { } blocks are used.

// ============================================================
// Client-specific nodes
// ============================================================

export class StateDeclaration {
  constructor(name, typeAnnotation, initialValue, loc) {
    this.type = 'StateDeclaration';
    this.name = name;
    this.typeAnnotation = typeAnnotation;
    this.initialValue = initialValue;
    this.loc = loc;
  }
}

export class ComputedDeclaration {
  constructor(name, expression, loc) {
    this.type = 'ComputedDeclaration';
    this.name = name;
    this.expression = expression;
    this.loc = loc;
  }
}

export class EffectDeclaration {
  constructor(body, loc) {
    this.type = 'EffectDeclaration';
    this.body = body;
    this.loc = loc;
  }
}

export class ComponentDeclaration {
  constructor(name, params, body, loc) {
    this.type = 'ComponentDeclaration';
    this.name = name;
    this.params = params;
    this.body = body; // Array of JSX elements and statements
    this.loc = loc;
  }
}

export class ComponentStyleBlock {
  constructor(css, loc) {
    this.type = 'ComponentStyleBlock';
    this.css = css; // raw CSS string
    this.loc = loc;
  }
}

export class StoreDeclaration {
  constructor(name, body, loc) {
    this.type = 'StoreDeclaration';
    this.name = name;   // e.g. "TodoStore"
    this.body = body;   // Array of StateDeclaration, ComputedDeclaration, FunctionDeclaration
    this.loc = loc;
  }
}

// ============================================================
// JSX-like nodes
// ============================================================

export class JSXElement {
  constructor(tag, attributes, children, selfClosing, loc) {
    this.type = 'JSXElement';
    this.tag = tag;
    this.attributes = attributes; // Array of JSXAttribute
    this.children = children;     // Array of JSXElement, JSXText, JSXExpression
    this.selfClosing = selfClosing;
    this.loc = loc;
  }
}

export class JSXAttribute {
  constructor(name, value, loc) {
    this.type = 'JSXAttribute';
    this.name = name;   // string (e.g., "class", "on:click")
    this.value = value;  // Expression or string
    this.loc = loc;
  }
}

export class JSXSpreadAttribute {
  constructor(expression, loc) {
    this.type = 'JSXSpreadAttribute';
    this.expression = expression;
    this.loc = loc;
  }
}

export class JSXFragment {
  constructor(children, loc) {
    this.type = 'JSXFragment';
    this.children = children;     // Array of JSXElement, JSXText, JSXExpression, etc.
    this.loc = loc;
  }
}

export class JSXText {
  constructor(value, loc) {
    this.type = 'JSXText';
    this.value = value;
    this.loc = loc;
  }
}

export class JSXExpression {
  constructor(expression, loc) {
    this.type = 'JSXExpression';
    this.expression = expression;
    this.loc = loc;
  }
}

export class JSXFor {
  constructor(variable, iterable, body, loc, keyExpr = null) {
    this.type = 'JSXFor';
    this.variable = variable;
    this.iterable = iterable;
    this.body = body;
    this.keyExpr = keyExpr; // optional key expression for keyed reconciliation
    this.loc = loc;
  }
}

export class JSXIf {
  constructor(condition, consequent, alternate, loc, alternates = []) {
    this.type = 'JSXIf';
    this.condition = condition;
    this.consequent = consequent;
    this.alternates = alternates; // Array of { condition, body } for elif chains
    this.alternate = alternate;   // else body (or null)
    this.loc = loc;
  }
}
