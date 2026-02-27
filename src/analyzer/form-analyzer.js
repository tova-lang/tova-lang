// Form-specific analyzer methods for the Tova language
// Extracted for lazy loading — only loaded when form { } blocks are encountered.

import { Symbol } from './scope.js';

export function installFormAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._formAnalyzerInstalled) return;
  AnalyzerClass.prototype._formAnalyzerInstalled = true;

  const KNOWN_VALIDATORS = new Set([
    'required', 'minLength', 'maxLength', 'min', 'max',
    'pattern', 'email', 'matches', 'oneOf', 'validate',
  ]);

  AnalyzerClass.prototype.visitFormDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'browser') {
      this.error(`'form' can only be used inside a browser block or component`, node.loc,
        "move this inside a browser { } block", { code: 'E310' });
    }

    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'form', node.typeAnnotation, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }

    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('form');
    try {
      for (const field of node.fields) { this._visitFormField(field); }
      for (const group of node.groups) { this._visitFormGroup(group); }
      for (const arr of node.arrays) { this._visitFormArray(arr); }
      for (const comp of node.computeds) { this.visitNode(comp); }
      if (node.steps) { this._visitFormSteps(node, node.steps); }
      if (node.onSubmit) { this.visitNode(node.onSubmit); }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype._visitFormField = function(node) {
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'formField', node.typeAnnotation, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    if (node.initialValue) {
      this.visitExpression(node.initialValue);
    }
    for (const v of node.validators) {
      if (!KNOWN_VALIDATORS.has(v.name)) {
        this.warn(`Unknown validator '${v.name}'`, v.loc, null, { code: 'W_UNKNOWN_VALIDATOR' });
      }
      for (const arg of v.args) {
        this.visitExpression(arg);
      }
    }
  };

  AnalyzerClass.prototype._visitFormGroup = function(node) {
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'formGroup', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    if (node.condition) {
      this.visitExpression(node.condition);
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    try {
      for (const field of node.fields) { this._visitFormField(field); }
      for (const group of node.groups) { this._visitFormGroup(group); }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype._visitFormArray = function(node) {
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'formArray', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    try {
      for (const field of node.fields) { this._visitFormField(field); }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype._visitFormSteps = function(formNode, stepsNode) {
    const knownMembers = new Set();
    for (const f of formNode.fields) knownMembers.add(f.name);
    for (const g of formNode.groups) knownMembers.add(g.name);
    for (const a of formNode.arrays) knownMembers.add(a.name);

    for (const step of stepsNode.steps) {
      for (const member of step.members) {
        if (!knownMembers.has(member)) {
          this.warn(`Step '${step.label}' references unknown member '${member}'`, step.loc, null, { code: 'W_STEP_UNKNOWN_MEMBER' });
        }
      }
    }
  };
}
