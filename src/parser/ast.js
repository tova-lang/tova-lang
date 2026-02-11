// AST Node definitions for the Lux language

// ============================================================
// Program (root node)
// ============================================================

export class Program {
  constructor(body) {
    this.type = 'Program';
    this.body = body; // Array of top-level statements/blocks
  }
}

// ============================================================
// Full-stack blocks
// ============================================================

export class ServerBlock {
  constructor(body, loc, name = null) {
    this.type = 'ServerBlock';
    this.name = name;
    this.body = body;
    this.loc = loc;
  }
}

export class ClientBlock {
  constructor(body, loc, name = null) {
    this.type = 'ClientBlock';
    this.name = name;
    this.body = body;
    this.loc = loc;
  }
}

export class SharedBlock {
  constructor(body, loc, name = null) {
    this.type = 'SharedBlock';
    this.name = name;
    this.body = body;
    this.loc = loc;
  }
}

// ============================================================
// Declarations
// ============================================================

export class Assignment {
  constructor(targets, values, loc) {
    this.type = 'Assignment';
    this.targets = targets;   // Array of identifiers (supports multiple: a, b = 1, 2)
    this.values = values;     // Array of expressions
    this.loc = loc;
  }
}

export class VarDeclaration {
  constructor(targets, values, loc) {
    this.type = 'VarDeclaration';
    this.targets = targets;   // Array of identifiers
    this.values = values;     // Array of expressions
    this.loc = loc;
  }
}

export class LetDestructure {
  constructor(pattern, value, loc) {
    this.type = 'LetDestructure';
    this.pattern = pattern;   // ObjectPattern or ArrayPattern
    this.value = value;       // Expression
    this.loc = loc;
  }
}

export class FunctionDeclaration {
  constructor(name, params, body, returnType, loc) {
    this.type = 'FunctionDeclaration';
    this.name = name;
    this.params = params;     // Array of Parameter nodes
    this.body = body;         // BlockStatement or Expression (implicit return)
    this.returnType = returnType; // optional type annotation
    this.loc = loc;
  }
}

export class Parameter {
  constructor(name, typeAnnotation, defaultValue, loc) {
    this.type = 'Parameter';
    this.name = name;
    this.typeAnnotation = typeAnnotation; // optional
    this.defaultValue = defaultValue;     // optional
    this.loc = loc;
  }
}

export class TypeDeclaration {
  constructor(name, typeParams, variants, loc) {
    this.type = 'TypeDeclaration';
    this.name = name;
    this.typeParams = typeParams; // Array of type parameter names (generics)
    this.variants = variants;     // Array of TypeVariant or TypeField
    this.loc = loc;
  }
}

export class TypeVariant {
  constructor(name, fields, loc) {
    this.type = 'TypeVariant';
    this.name = name;
    this.fields = fields; // Array of { name, typeAnnotation }
    this.loc = loc;
  }
}

export class TypeField {
  constructor(name, typeAnnotation, loc) {
    this.type = 'TypeField';
    this.name = name;
    this.typeAnnotation = typeAnnotation;
    this.loc = loc;
  }
}

// ============================================================
// Import / Export
// ============================================================

export class ImportDeclaration {
  constructor(specifiers, source, loc) {
    this.type = 'ImportDeclaration';
    this.specifiers = specifiers; // Array of { imported, local }
    this.source = source;         // string literal
    this.loc = loc;
  }
}

export class ImportSpecifier {
  constructor(imported, local, loc) {
    this.type = 'ImportSpecifier';
    this.imported = imported;
    this.local = local || imported;
    this.loc = loc;
  }
}

export class ImportDefault {
  constructor(local, source, loc) {
    this.type = 'ImportDefault';
    this.local = local;
    this.source = source;
    this.loc = loc;
  }
}

// ============================================================
// Statements
// ============================================================

export class BlockStatement {
  constructor(body, loc) {
    this.type = 'BlockStatement';
    this.body = body;
    this.loc = loc;
  }
}

export class ReturnStatement {
  constructor(value, loc) {
    this.type = 'ReturnStatement';
    this.value = value;
    this.loc = loc;
  }
}

export class IfStatement {
  constructor(condition, consequent, alternates, elseBody, loc) {
    this.type = 'IfStatement';
    this.condition = condition;
    this.consequent = consequent;     // BlockStatement
    this.alternates = alternates;     // Array of { condition, body } for elif
    this.elseBody = elseBody;         // BlockStatement or null
    this.loc = loc;
  }
}

export class ForStatement {
  constructor(variable, iterable, body, elseBody, loc) {
    this.type = 'ForStatement';
    this.variable = variable;   // Identifier or destructure pattern
    this.iterable = iterable;   // Expression
    this.body = body;           // BlockStatement
    this.elseBody = elseBody;   // BlockStatement or null (for-else)
    this.loc = loc;
  }
}

export class WhileStatement {
  constructor(condition, body, loc) {
    this.type = 'WhileStatement';
    this.condition = condition;
    this.body = body;
    this.loc = loc;
  }
}

export class IfExpression {
  constructor(condition, consequent, alternates, elseBody, loc) {
    this.type = 'IfExpression';
    this.condition = condition;
    this.consequent = consequent;     // BlockStatement
    this.alternates = alternates;     // Array of { condition, body } for elif
    this.elseBody = elseBody;         // BlockStatement (required)
    this.loc = loc;
  }
}

export class ExpressionStatement {
  constructor(expression, loc) {
    this.type = 'ExpressionStatement';
    this.expression = expression;
    this.loc = loc;
  }
}

// ============================================================
// Expressions
// ============================================================

export class Identifier {
  constructor(name, loc) {
    this.type = 'Identifier';
    this.name = name;
    this.loc = loc;
  }
}

export class NumberLiteral {
  constructor(value, loc) {
    this.type = 'NumberLiteral';
    this.value = value;
    this.loc = loc;
  }
}

export class StringLiteral {
  constructor(value, loc) {
    this.type = 'StringLiteral';
    this.value = value;
    this.loc = loc;
  }
}

export class TemplateLiteral {
  constructor(parts, loc) {
    this.type = 'TemplateLiteral';
    this.parts = parts; // Array of { type: 'text'|'expr', value }
    this.loc = loc;
  }
}

export class BooleanLiteral {
  constructor(value, loc) {
    this.type = 'BooleanLiteral';
    this.value = value;
    this.loc = loc;
  }
}

export class NilLiteral {
  constructor(loc) {
    this.type = 'NilLiteral';
    this.loc = loc;
  }
}

export class ArrayLiteral {
  constructor(elements, loc) {
    this.type = 'ArrayLiteral';
    this.elements = elements;
    this.loc = loc;
  }
}

export class ObjectLiteral {
  constructor(properties, loc) {
    this.type = 'ObjectLiteral';
    this.properties = properties; // Array of { key, value, shorthand }
    this.loc = loc;
  }
}

export class BinaryExpression {
  constructor(operator, left, right, loc) {
    this.type = 'BinaryExpression';
    this.operator = operator;
    this.left = left;
    this.right = right;
    this.loc = loc;
  }
}

export class UnaryExpression {
  constructor(operator, operand, prefix, loc) {
    this.type = 'UnaryExpression';
    this.operator = operator;
    this.operand = operand;
    this.prefix = prefix;
    this.loc = loc;
  }
}

export class ChainedComparison {
  constructor(operands, operators, loc) {
    this.type = 'ChainedComparison';
    this.operands = operands;   // [a, b, c] for a < b < c
    this.operators = operators; // ['<', '<']
    this.loc = loc;
  }
}

export class LogicalExpression {
  constructor(operator, left, right, loc) {
    this.type = 'LogicalExpression';
    this.operator = operator; // 'and', 'or', '&&', '||'
    this.left = left;
    this.right = right;
    this.loc = loc;
  }
}

export class CallExpression {
  constructor(callee, args, loc) {
    this.type = 'CallExpression';
    this.callee = callee;
    this.arguments = args;
    this.loc = loc;
  }
}

export class NamedArgument {
  constructor(name, value, loc) {
    this.type = 'NamedArgument';
    this.name = name;
    this.value = value;
    this.loc = loc;
  }
}

export class MemberExpression {
  constructor(object, property, computed, loc) {
    this.type = 'MemberExpression';
    this.object = object;
    this.property = property;
    this.computed = computed; // true for obj[expr], false for obj.prop
    this.loc = loc;
  }
}

export class OptionalChain {
  constructor(object, property, computed, loc) {
    this.type = 'OptionalChain';
    this.object = object;
    this.property = property;
    this.computed = computed;
    this.loc = loc;
  }
}

export class PipeExpression {
  constructor(left, right, loc) {
    this.type = 'PipeExpression';
    this.left = left;
    this.right = right;
    this.loc = loc;
  }
}

export class LambdaExpression {
  constructor(params, body, loc) {
    this.type = 'LambdaExpression';
    this.params = params;
    this.body = body;
    this.loc = loc;
  }
}

export class MatchExpression {
  constructor(subject, arms, loc) {
    this.type = 'MatchExpression';
    this.subject = subject;
    this.arms = arms; // Array of MatchArm
    this.loc = loc;
  }
}

export class MatchArm {
  constructor(pattern, guard, body, loc) {
    this.type = 'MatchArm';
    this.pattern = pattern;
    this.guard = guard;   // optional guard expression (if condition)
    this.body = body;
    this.loc = loc;
  }
}

export class RangeExpression {
  constructor(start, end, inclusive, loc) {
    this.type = 'RangeExpression';
    this.start = start;
    this.end = end;
    this.inclusive = inclusive; // true for ..=, false for ..
    this.loc = loc;
  }
}

export class SliceExpression {
  constructor(object, start, end, step, loc) {
    this.type = 'SliceExpression';
    this.object = object;
    this.start = start;
    this.end = end;
    this.step = step;
    this.loc = loc;
  }
}

export class SpreadExpression {
  constructor(argument, loc) {
    this.type = 'SpreadExpression';
    this.argument = argument;
    this.loc = loc;
  }
}

export class ListComprehension {
  constructor(expression, variable, iterable, condition, loc) {
    this.type = 'ListComprehension';
    this.expression = expression;
    this.variable = variable;
    this.iterable = iterable;
    this.condition = condition; // optional filter
    this.loc = loc;
  }
}

export class DictComprehension {
  constructor(key, value, variables, iterable, condition, loc) {
    this.type = 'DictComprehension';
    this.key = key;
    this.value = value;
    this.variables = variables;
    this.iterable = iterable;
    this.condition = condition;
    this.loc = loc;
  }
}

export class MembershipExpression {
  constructor(value, collection, negated, loc) {
    this.type = 'MembershipExpression';
    this.value = value;
    this.collection = collection;
    this.negated = negated; // true for "not in"
    this.loc = loc;
  }
}

export class CompoundAssignment {
  constructor(target, operator, value, loc) {
    this.type = 'CompoundAssignment';
    this.target = target;
    this.operator = operator; // +=, -=, *=, /=
    this.value = value;
    this.loc = loc;
  }
}

// ============================================================
// Patterns (for destructuring and match)
// ============================================================

export class ObjectPattern {
  constructor(properties, loc) {
    this.type = 'ObjectPattern';
    this.properties = properties; // Array of { key, value (alias), defaultValue }
    this.loc = loc;
  }
}

export class ArrayPattern {
  constructor(elements, loc) {
    this.type = 'ArrayPattern';
    this.elements = elements;
    this.loc = loc;
  }
}

export class WildcardPattern {
  constructor(loc) {
    this.type = 'WildcardPattern';
    this.loc = loc;
  }
}

export class LiteralPattern {
  constructor(value, loc) {
    this.type = 'LiteralPattern';
    this.value = value;
    this.loc = loc;
  }
}

export class VariantPattern {
  constructor(name, fields, loc) {
    this.type = 'VariantPattern';
    this.name = name;
    this.fields = fields;
    this.loc = loc;
  }
}

export class BindingPattern {
  constructor(name, loc) {
    this.type = 'BindingPattern';
    this.name = name;
    this.loc = loc;
  }
}

export class RangePattern {
  constructor(start, end, inclusive, loc) {
    this.type = 'RangePattern';
    this.start = start;
    this.end = end;
    this.inclusive = inclusive;
    this.loc = loc;
  }
}

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
  constructor(variable, iterable, body, loc) {
    this.type = 'JSXFor';
    this.variable = variable;
    this.iterable = iterable;
    this.body = body;
    this.loc = loc;
  }
}

export class JSXIf {
  constructor(condition, consequent, alternate, loc) {
    this.type = 'JSXIf';
    this.condition = condition;
    this.consequent = consequent;
    this.alternate = alternate;
    this.loc = loc;
  }
}

// ============================================================
// Server-specific nodes
// ============================================================

export class RouteDeclaration {
  constructor(method, path, handler, loc) {
    this.type = 'RouteDeclaration';
    this.method = method;   // GET, POST, PUT, DELETE, PATCH
    this.path = path;       // string literal
    this.handler = handler; // Identifier or FunctionDeclaration
    this.loc = loc;
  }
}

// ============================================================
// Type annotations
// ============================================================

export class TypeAnnotation {
  constructor(name, typeParams, loc) {
    this.type = 'TypeAnnotation';
    this.name = name;         // "Int", "String", "Bool", "Float", etc.
    this.typeParams = typeParams; // Array of TypeAnnotation (for generics)
    this.loc = loc;
  }
}

export class ArrayTypeAnnotation {
  constructor(elementType, loc) {
    this.type = 'ArrayTypeAnnotation';
    this.elementType = elementType;
    this.loc = loc;
  }
}

export class FunctionTypeAnnotation {
  constructor(paramTypes, returnType, loc) {
    this.type = 'FunctionTypeAnnotation';
    this.paramTypes = paramTypes;
    this.returnType = returnType;
    this.loc = loc;
  }
}
