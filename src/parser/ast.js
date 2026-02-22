// AST Node definitions for the Tova language

// Sentinel value for pipe target placeholder (used in method pipe |> .method())
export const PIPE_TARGET = '__pipe_target__';

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
  constructor(name, params, body, returnType, loc, isAsync = false, typeParams = []) {
    this.type = 'FunctionDeclaration';
    this.name = name;
    this.typeParams = typeParams; // Array of type parameter names (generics)
    this.params = params;     // Array of Parameter nodes
    this.body = body;         // BlockStatement or Expression (implicit return)
    this.returnType = returnType; // optional type annotation
    this.isAsync = isAsync;
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

export class ImportWildcard {
  constructor(local, source, loc) {
    this.type = 'ImportWildcard';
    this.local = local;    // namespace binding name
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
  constructor(variable, iterable, body, elseBody, loc, guard = null, label = null, isAsync = false) {
    this.type = 'ForStatement';
    this.variable = variable;   // Identifier or destructure pattern
    this.iterable = iterable;   // Expression
    this.body = body;           // BlockStatement
    this.elseBody = elseBody;   // BlockStatement or null (for-else)
    this.guard = guard;         // Expression or null (when guard)
    this.label = label;         // string or null (for named loops)
    this.isAsync = isAsync;     // true for `async for x in stream`
    this.loc = loc;
  }
}

export class WhileStatement {
  constructor(condition, body, loc, label = null) {
    this.type = 'WhileStatement';
    this.condition = condition;
    this.body = body;
    this.label = label;         // string or null (for named loops)
    this.loc = loc;
  }
}

export class LoopStatement {
  constructor(body, label, loc) {
    this.type = 'LoopStatement';
    this.body = body;           // BlockStatement
    this.label = label;         // string or null (for named loops)
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

export class TryCatchStatement {
  constructor(tryBody, catchParam, catchBody, loc, finallyBody = null) {
    this.type = 'TryCatchStatement';
    this.tryBody = tryBody;         // Array of statements
    this.catchParam = catchParam;   // string (error variable name) or null
    this.catchBody = catchBody;     // Array of statements (or null if try/finally only)
    this.finallyBody = finallyBody; // Array of statements or null
    this.loc = loc;
  }
}

export class BreakStatement {
  constructor(loc, label = null) {
    this.type = 'BreakStatement';
    this.label = label;         // string or null (for named break)
    this.loc = loc;
  }
}

export class ContinueStatement {
  constructor(loc, label = null) {
    this.type = 'ContinueStatement';
    this.label = label;         // string or null (for named continue)
    this.loc = loc;
  }
}

export class GuardStatement {
  constructor(condition, elseBody, loc) {
    this.type = 'GuardStatement';
    this.condition = condition;
    this.elseBody = elseBody; // BlockStatement
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

export class RegexLiteral {
  constructor(pattern, flags, loc) {
    this.type = 'RegexLiteral';
    this.pattern = pattern;
    this.flags = flags;
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
  constructor(params, body, loc, isAsync = false) {
    this.type = 'LambdaExpression';
    this.params = params;
    this.body = body;
    this.isAsync = isAsync;
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

export class PropagateExpression {
  constructor(expression, loc) {
    this.type = 'PropagateExpression';
    this.expression = expression;
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

export class IsExpression {
  constructor(value, typeName, negated, loc) {
    this.type = 'IsExpression';
    this.value = value;
    this.typeName = typeName;     // string: "String", "Int", "Nil", etc.
    this.negated = negated;       // true for "is not"
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

export class AwaitExpression {
  constructor(argument, loc) {
    this.type = 'AwaitExpression';
    this.argument = argument;
    this.loc = loc;
  }
}

export class InterfaceDeclaration {
  constructor(name, methods, loc) {
    this.type = 'InterfaceDeclaration';
    this.name = name;
    this.methods = methods; // Array of { name, params, returnType }
    this.loc = loc;
  }
}

export class StringConcatPattern {
  constructor(prefix, rest, loc) {
    this.type = 'StringConcatPattern';
    this.prefix = prefix; // StringLiteral value
    this.rest = rest;     // BindingPattern or WildcardPattern
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
// Client-specific nodes (lazy-loaded from client-ast.js, re-exported for backward compat)
// ============================================================

export {
  StateDeclaration, ComputedDeclaration, EffectDeclaration,
  ComponentDeclaration, ComponentStyleBlock, StoreDeclaration,
  JSXElement, JSXAttribute, JSXSpreadAttribute, JSXFragment,
  JSXText, JSXExpression, JSXFor, JSXIf, JSXMatch,
} from './client-ast.js';

// ============================================================
// Server-specific nodes (lazy-loaded from server-ast.js, re-exported for backward compat)
// ============================================================

export {
  RouteDeclaration, MiddlewareDeclaration, HealthCheckDeclaration,
  CorsDeclaration, ErrorHandlerDeclaration, WebSocketDeclaration,
  StaticDeclaration, DiscoverDeclaration, AuthDeclaration,
  MaxBodyDeclaration, RouteGroupDeclaration, RateLimitDeclaration,
  LifecycleHookDeclaration, SubscribeDeclaration, EnvDeclaration,
  ScheduleDeclaration, UploadDeclaration, SessionDeclaration,
  DbDeclaration, TlsDeclaration, CompressionDeclaration,
  BackgroundJobDeclaration, CacheDeclaration, SseDeclaration,
  ModelDeclaration, AiConfigDeclaration,
} from './server-ast.js';

export class TestBlock {
  constructor(name, body, loc, options = {}) {
    this.type = 'TestBlock';
    this.name = name;       // optional string name
    this.body = body;       // Array of statements
    this.timeout = options.timeout || null;  // optional timeout in ms
    this.beforeEach = options.beforeEach || null; // Array of statements or null
    this.afterEach = options.afterEach || null;   // Array of statements or null
    this.loc = loc;
  }
}

export class BenchBlock {
  constructor(name, body, loc) {
    this.type = 'BenchBlock';
    this.name = name;       // optional string name
    this.body = body;       // Array of statements (expressions to benchmark)
    this.loc = loc;
  }
}

// ============================================================
// Extern declarations
// ============================================================

export class ExternDeclaration {
  constructor(name, params, returnType, loc, isAsync = false) {
    this.type = 'ExternDeclaration';
    this.name = name;
    this.params = params;     // Array of Parameter nodes (types only, names optional)
    this.returnType = returnType; // TypeAnnotation or null
    this.isAsync = isAsync;
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

export class UnionTypeAnnotation {
  constructor(members, loc) {
    this.type = 'UnionTypeAnnotation';
    this.members = members; // Array of TypeAnnotation nodes
    this.loc = loc;
  }
}

// ============================================================
// Impl blocks
// ============================================================

export class ImplDeclaration {
  constructor(typeName, methods, loc, traitName = null) {
    this.type = 'ImplDeclaration';
    this.typeName = typeName;
    this.traitName = traitName; // null for plain impl, string for `impl Trait for Type`
    this.methods = methods;     // Array of FunctionDeclaration (first param is self)
    this.loc = loc;
  }
}

// ============================================================
// Trait declarations
// ============================================================

export class TraitDeclaration {
  constructor(name, methods, loc) {
    this.type = 'TraitDeclaration';
    this.name = name;
    this.methods = methods; // Array of { name, params, returnType, body (optional for defaults) }
    this.loc = loc;
  }
}

// ============================================================
// Type aliases
// ============================================================

export class TypeAlias {
  constructor(name, typeParams, typeExpr, loc) {
    this.type = 'TypeAlias';
    this.name = name;
    this.typeParams = typeParams; // Array of type parameter names (for generics)
    this.typeExpr = typeExpr; // TypeAnnotation
    this.loc = loc;
  }
}

// ============================================================
// Defer statement
// ============================================================

export class WithStatement {
  constructor(expression, name, body, loc) {
    this.type = 'WithStatement';
    this.expression = expression; // resource expression
    this.name = name;             // binding name (string)
    this.body = body;             // BlockStatement
    this.loc = loc;
  }
}

export class DeferStatement {
  constructor(body, loc) {
    this.type = 'DeferStatement';
    this.body = body; // Expression or BlockStatement
    this.loc = loc;
  }
}

// ============================================================
// Yield expression (generators)
// ============================================================

export class YieldExpression {
  constructor(argument, delegate, loc) {
    this.type = 'YieldExpression';
    this.argument = argument; // expression to yield
    this.delegate = delegate; // true for `yield from`
    this.loc = loc;
  }
}

// ============================================================
// Tuple expression/pattern/type
// ============================================================

export class TupleExpression {
  constructor(elements, loc) {
    this.type = 'TupleExpression';
    this.elements = elements; // Array of expressions
    this.loc = loc;
  }
}

export class TuplePattern {
  constructor(elements, loc) {
    this.type = 'TuplePattern';
    this.elements = elements; // Array of patterns
    this.loc = loc;
  }
}

export class TupleTypeAnnotation {
  constructor(elementTypes, loc) {
    this.type = 'TupleTypeAnnotation';
    this.elementTypes = elementTypes;
    this.loc = loc;
  }
}

// ============================================================
// Column expressions (for table operations)
// ============================================================

export class ColumnExpression {
  constructor(name, loc) {
    this.type = 'ColumnExpression';
    this.name = name;  // column name, e.g. "age" for .age
    this.loc = loc;
  }
}

export class ColumnAssignment {
  constructor(target, expression, loc) {
    this.type = 'ColumnAssignment';
    this.target = target;       // column name to assign to
    this.expression = expression; // expression computing the value
    this.loc = loc;
  }
}

export class NegatedColumnExpression {
  constructor(name, loc) {
    this.type = 'NegatedColumnExpression';
    this.name = name;  // column name for exclusion, e.g. "password" for -.password
    this.loc = loc;
  }
}

// ============================================================
// Data block nodes
// ============================================================

export class DataBlock {
  constructor(body, loc) {
    this.type = 'DataBlock';
    this.body = body;  // Array of SourceDeclaration, PipelineDeclaration, ValidateBlock, RefreshPolicy
    this.loc = loc;
  }
}

export class SourceDeclaration {
  constructor(name, typeAnnotation, expression, loc) {
    this.type = 'SourceDeclaration';
    this.name = name;
    this.typeAnnotation = typeAnnotation;
    this.expression = expression;
    this.loc = loc;
  }
}

export class PipelineDeclaration {
  constructor(name, expression, loc) {
    this.type = 'PipelineDeclaration';
    this.name = name;
    this.expression = expression;
    this.loc = loc;
  }
}

export class ValidateBlock {
  constructor(typeName, rules, loc) {
    this.type = 'ValidateBlock';
    this.typeName = typeName;
    this.rules = rules;  // Array of expression predicates
    this.loc = loc;
  }
}

export class RefreshPolicy {
  constructor(sourceName, interval, loc) {
    this.type = 'RefreshPolicy';
    this.sourceName = sourceName;
    this.interval = interval;  // { value, unit } or "on_demand"
    this.loc = loc;
  }
}

// ============================================================
// Refinement types
// ============================================================

export class RefinementType {
  constructor(name, baseType, predicate, loc) {
    this.type = 'RefinementType';
    this.name = name;
    this.baseType = baseType;      // TypeAnnotation
    this.predicate = predicate;    // Expression (body of where block, uses 'it')
    this.loc = loc;
  }
}
