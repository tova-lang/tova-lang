// Browser-specific analyzer methods for the Tova language
// Extracted from analyzer.js for lazy loading — only loaded when browser { } blocks are encountered.

import { Symbol } from './scope.js';
import { installFormAnalyzer } from './form-analyzer.js';

export function installBrowserAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._browserAnalyzerInstalled) return;
  AnalyzerClass.prototype._browserAnalyzerInstalled = true;

  installFormAnalyzer(AnalyzerClass);

  AnalyzerClass.prototype.visitBrowserBlock = function(node) {
    const prevScope = this.currentScope;
    let browserScope = null;
    for (const ch of this.currentScope.children) {
      if (ch.context === 'browser') { browserScope = ch; break; }
    }
    const isFirst = !browserScope;
    this.currentScope = browserScope || this.currentScope.child('browser');

    // On first browser block, pre-register state/computed/function names from ALL
    // browser blocks so cross-file references resolve regardless of file order.
    if (isFirst && this.ast && this.ast.body) {
      for (const topNode of this.ast.body) {
        if (topNode.type === 'BrowserBlock') {
          this._preRegisterBrowserDecls(topNode.body);
        }
      }
      // Pre-register auth-injected signals and functions when an AuthBlock exists
      const hasAuthBlock = this.ast.body.some(n => n.type === 'AuthBlock');
      if (hasAuthBlock) {
        for (const name of ['$currentUser', '$isAuthenticated', '$authLoading']) {
          if (!this.currentScope.symbols.has(name)) {
            const sym = new Symbol(name, 'state', null, true, null);
            sym._forward = true;
            try { this.currentScope.define(name, sym); } catch (e) { /* ignore */ }
          }
        }
        for (const name of ['logout', 'LoginForm', 'SignupForm', 'ForgotPasswordForm', 'ResetPasswordForm', 'AuthGuard']) {
          if (!this.currentScope.symbols.has(name)) {
            const sym = new Symbol(name, 'function', null, false, null);
            sym._forward = true;
            try { this.currentScope.define(name, sym); } catch (e) { /* ignore */ }
          }
        }
      }
    }

    try {
      for (const stmt of node.body) {
        this.visitNode(stmt);
      }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype._preRegisterBrowserDecls = function(stmts) {
    for (const stmt of stmts) {
      const name = stmt.name;
      if (!name) continue;
      let kind = null;
      if (stmt.type === 'StateDeclaration') kind = 'state';
      else if (stmt.type === 'ComputedDeclaration') kind = 'computed';
      else if (stmt.type === 'FunctionDeclaration') kind = 'function';
      else if (stmt.type === 'ComponentDeclaration') kind = 'component';
      if (kind && !this.currentScope.symbols.has(name)) {
        const sym = new Symbol(name, kind, stmt.typeAnnotation || null, kind === 'state', stmt.loc);
        sym._forward = true;
        try { this.currentScope.define(name, sym); } catch (e) { /* ignore */ }
      }
    }
  };

  AnalyzerClass.prototype.visitStateDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'browser' && !this._inPubComponent) {
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
    if (ctx !== 'browser' && !this._inPubComponent) {
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
    if (ctx !== 'browser' && !this._inPubComponent) {
      this.error(`'effect' can only be used inside a browser block`, node.loc, "move this inside a browser { } block", { code: 'E302' });
    }
    this.visitNode(node.body);
  };

  AnalyzerClass.prototype.visitComponentDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'browser' && !node.isPublic) {
      this.error(`'component' can only be used inside a browser block`, node.loc, "move this inside a browser { } block", { code: 'E302' });
    }
    // Skip naming convention check for compound components (e.g. Dialog.Title)
    // since "Dialog.Title" isn't a single PascalCase identifier
    if (!node.parent) {
      this._checkNamingConvention(node.name, 'component', node.loc);
    }
    // For compound components, register with the parent name (already defined)
    // and use the full name for the symbol definition
    const symbolName = node.name;
    try {
      this.currentScope.define(symbolName,
        new Symbol(symbolName, 'component', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }

    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    // Store component prop names for variant() validation in style blocks
    const prevComponentProps = this._currentComponentProps;
    this._currentComponentProps = node.params.map(p => p.name);
    // Track pub component context so state/computed/effect are allowed inside
    const prevInPubComponent = this._inPubComponent;
    if (node.isPublic) this._inPubComponent = true;
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
      this._currentComponentProps = prevComponentProps;
      this._inPubComponent = prevInPubComponent;
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
      // Bug fix 3: Create child scope and visit pattern to define bound variables
      // Match the pattern used in visitMatchExpression
      const prevScope = this.currentScope;
      this.currentScope = this.currentScope.child('block');

      try {
        this.visitPattern(arm.pattern);
        if (arm.guard) this.visitExpression(arm.guard);

        for (const child of arm.body) {
          this.visitNode(child);
        }
      } finally {
        this.currentScope = prevScope;
      }
    }
  };
}
