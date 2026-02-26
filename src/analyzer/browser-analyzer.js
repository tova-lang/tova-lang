// Browser-specific analyzer methods for the Tova language
// Extracted from analyzer.js for lazy loading — only loaded when browser { } blocks are encountered.

import { Symbol } from './scope.js';

export function installBrowserAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._browserAnalyzerInstalled) return;
  AnalyzerClass.prototype._browserAnalyzerInstalled = true;

  AnalyzerClass.prototype.visitBrowserBlock = function(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('browser');
    try {
      for (const stmt of node.body) {
        this.visitNode(stmt);
      }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitStateDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'browser') {
      this.error(`'state' can only be used inside a browser block`, node.loc, "move this inside a browser { } block", { code: 'E302' });
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'state', node.typeAnnotation, true, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    this.visitExpression(node.initialValue);
  };

  AnalyzerClass.prototype.visitComputedDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'browser') {
      this.error(`'computed' can only be used inside a browser block`, node.loc, "move this inside a browser { } block", { code: 'E302' });
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'computed', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    this.visitExpression(node.expression);
  };

  AnalyzerClass.prototype.visitEffectDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'browser') {
      this.error(`'effect' can only be used inside a browser block`, node.loc, "move this inside a browser { } block", { code: 'E302' });
    }
    this.visitNode(node.body);
  };

  AnalyzerClass.prototype.visitComponentDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'browser') {
      this.error(`'component' can only be used inside a browser block`, node.loc, "move this inside a browser { } block", { code: 'E302' });
    }
    this._checkNamingConvention(node.name, 'component', node.loc);
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'component', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }

    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    try {
      for (const child of node.body) {
        this.visitNode(child);
      }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitStoreDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'browser') {
      this.error(`'store' can only be used inside a browser block`, node.loc, "move this inside a browser { } block", { code: 'E302' });
    }
    this._checkNamingConvention(node.name, 'store', node.loc);
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'variable', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }

    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    try {
      for (const child of node.body) {
        this.visitNode(child);
      }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype._visitJSXChildren = function(children) {
    for (const child of children) {
      if (child.type === 'JSXElement') {
        this.visitJSXElement(child);
      } else if (child.type === 'JSXFragment') {
        this.visitJSXFragment(child);
      } else if (child.type === 'JSXExpression') {
        this.visitExpression(child.expression);
      } else if (child.type === 'JSXFor') {
        this.visitJSXFor(child);
      } else if (child.type === 'JSXIf') {
        this.visitJSXIf(child);
      } else if (child.type === 'JSXMatch') {
        this.visitJSXMatch(child);
      } else if (child.type === 'JSXText') {
        // JSXText wraps a TemplateLiteral/StringLiteral in its .value
        // Visit it so identifiers in interpolated strings are marked as used
        if (child.value) this.visitExpression(child.value);
      } else if (child.type) {
        // Other expression-type children
        this.visitExpression(child);
      }
    }
  };

  AnalyzerClass.prototype.visitJSXElement = function(node) {
    for (const attr of node.attributes) {
      if (attr.type === 'JSXSpreadAttribute') {
        this.visitExpression(attr.expression);
      } else {
        this.visitExpression(attr.value);
      }
    }
    this._visitJSXChildren(node.children);
  };

  AnalyzerClass.prototype.visitJSXFragment = function(node) {
    this._visitJSXChildren(node.children);
  };

  AnalyzerClass.prototype.visitJSXFor = function(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    try {
      this.visitExpression(node.iterable);
      const variable = node.variable;
      if (typeof variable === 'string') {
        try {
          this.currentScope.define(variable,
            new Symbol(variable, 'variable', null, false, node.loc));
        } catch (e) { this.error(e.message); }
      } else if (variable.type === 'ArrayPattern') {
        for (const el of variable.elements) {
          try {
            this.currentScope.define(el,
              new Symbol(el, 'variable', null, false, variable.loc));
          } catch (e) { this.error(e.message); }
        }
      } else if (variable.type === 'ObjectPattern') {
        for (const prop of variable.properties) {
          const name = prop.value || prop.key;
          try {
            this.currentScope.define(name,
              new Symbol(name, 'variable', null, false, variable.loc));
          } catch (e) { this.error(e.message); }
        }
      }
      for (const child of node.body) {
        this.visitNode(child);
      }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitJSXIf = function(node) {
    this.visitExpression(node.condition);
    for (const child of node.consequent) {
      this.visitNode(child);
    }
    if (node.alternates) {
      for (const alt of node.alternates) {
        this.visitExpression(alt.condition);
        for (const child of alt.body) {
          this.visitNode(child);
        }
      }
    }
    if (node.alternate) {
      for (const child of node.alternate) {
        this.visitNode(child);
      }
    }
  };

  AnalyzerClass.prototype.visitJSXMatch = function(node) {
    this.visitExpression(node.subject);
    for (const arm of node.arms) {
      // Visit pattern bindings in a child scope
      for (const child of arm.body) {
        this.visitNode(child);
      }
    }
  };
}
