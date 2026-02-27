// Form-specific AST Node definitions for the Tova language
// Extracted for lazy loading — only loaded when form { } blocks are used.

// ============================================================
// Form-specific nodes
// ============================================================

export class FormDeclaration {
  constructor(name, typeAnnotation, fields, groups, arrays, computeds, steps, onSubmit, loc) {
    this.type = 'FormDeclaration';
    this.name = name;
    this.typeAnnotation = typeAnnotation;
    this.fields = fields;
    this.groups = groups;
    this.arrays = arrays;
    this.computeds = computeds;
    this.steps = steps;
    this.onSubmit = onSubmit;
    this.loc = loc;
  }
}

export class FormFieldDeclaration {
  constructor(name, typeAnnotation, initialValue, validators, loc) {
    this.type = 'FormFieldDeclaration';
    this.name = name;
    this.typeAnnotation = typeAnnotation;
    this.initialValue = initialValue;
    this.validators = validators;
    this.loc = loc;
  }
}

export class FormGroupDeclaration {
  constructor(name, condition, fields, groups, loc) {
    this.type = 'FormGroupDeclaration';
    this.name = name;
    this.condition = condition;
    this.fields = fields;
    this.groups = groups;
    this.loc = loc;
  }
}

export class FormArrayDeclaration {
  constructor(name, fields, validators, loc) {
    this.type = 'FormArrayDeclaration';
    this.name = name;
    this.fields = fields;
    this.validators = validators;
    this.loc = loc;
  }
}

export class FormValidator {
  constructor(name, args, isAsync, loc) {
    this.type = 'FormValidator';
    this.name = name;
    this.args = args;
    this.isAsync = isAsync;
    this.loc = loc;
  }
}

export class FormStepsDeclaration {
  constructor(steps, loc) {
    this.type = 'FormStepsDeclaration';
    this.steps = steps;
    this.loc = loc;
  }
}

export class FormStep {
  constructor(label, members, loc) {
    this.type = 'FormStep';
    this.label = label;
    this.members = members;
    this.loc = loc;
  }
}
