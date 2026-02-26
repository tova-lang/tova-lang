import { describe, test, expect } from "bun:test";
import * as AST from '../src/parser/ast.js';

describe('AST — PIPE_TARGET sentinel', () => {
  test('PIPE_TARGET is a string sentinel', () => {
    expect(typeof AST.PIPE_TARGET).toBe('string');
    expect(AST.PIPE_TARGET).toBe('__pipe_target__');
  });
});

describe('AST — Program node', () => {
  test('Program stores body array', () => {
    const p = new AST.Program([1, 2, 3]);
    expect(p.type).toBe('Program');
    expect(p.body).toEqual([1, 2, 3]);
  });

  test('Program with empty body', () => {
    const p = new AST.Program([]);
    expect(p.body).toEqual([]);
  });
});

describe('AST — Full-stack block nodes', () => {
  test('ServerBlock', () => {
    const n = new AST.ServerBlock(['stmt'], { line: 1 }, 'api');
    expect(n.type).toBe('ServerBlock');
    expect(n.body).toEqual(['stmt']);
    expect(n.loc).toEqual({ line: 1 });
    expect(n.name).toBe('api');
  });

  test('ServerBlock default name is null', () => {
    const n = new AST.ServerBlock([], { line: 1 });
    expect(n.name).toBeNull();
  });

  test('BrowserBlock', () => {
    const n = new AST.BrowserBlock(['stmt'], { line: 2 }, 'app');
    expect(n.type).toBe('BrowserBlock');
    expect(n.name).toBe('app');
  });

  test('SharedBlock', () => {
    const n = new AST.SharedBlock(['stmt'], { line: 3 });
    expect(n.type).toBe('SharedBlock');
    expect(n.name).toBeNull();
  });
});

describe('AST — Declaration nodes', () => {
  test('Assignment', () => {
    const n = new AST.Assignment(['x'], ['val'], { line: 1 });
    expect(n.type).toBe('Assignment');
    expect(n.targets).toEqual(['x']);
    expect(n.values).toEqual(['val']);
  });

  test('VarDeclaration', () => {
    const n = new AST.VarDeclaration(['x'], ['val'], { line: 1 });
    expect(n.type).toBe('VarDeclaration');
    expect(n.targets).toEqual(['x']);
    expect(n.values).toEqual(['val']);
  });

  test('FunctionDeclaration', () => {
    const n = new AST.FunctionDeclaration('foo', ['a', 'b'], 'body', null, { line: 1 }, false);
    expect(n.type).toBe('FunctionDeclaration');
    expect(n.name).toBe('foo');
    expect(n.params).toEqual(['a', 'b']);
    expect(n.isAsync).toBe(false);
  });

  test('FunctionDeclaration async', () => {
    const n = new AST.FunctionDeclaration('bar', [], 'body', null, { line: 1 }, true);
    expect(n.isAsync).toBe(true);
  });

  test('Parameter', () => {
    const n = new AST.Parameter('x', null, null, { line: 1 });
    expect(n.type).toBe('Parameter');
    expect(n.name).toBe('x');
    expect(n.defaultValue).toBeNull();
  });

  test('Parameter with default', () => {
    const n = new AST.Parameter('x', 'Int', 'defVal', { line: 1 });
    expect(n.defaultValue).toBe('defVal');
    expect(n.typeAnnotation).toBe('Int');
  });

  test('TypeDeclaration', () => {
    const n = new AST.TypeDeclaration('Color', [], ['Red', 'Green'], { line: 1 });
    expect(n.type).toBe('TypeDeclaration');
    expect(n.name).toBe('Color');
    expect(n.variants).toEqual(['Red', 'Green']);
  });

  test('TypeVariant', () => {
    const n = new AST.TypeVariant('Circle', ['radius'], { line: 1 });
    expect(n.type).toBe('TypeVariant');
    expect(n.name).toBe('Circle');
    expect(n.fields).toEqual(['radius']);
  });

  test('TypeField', () => {
    const n = new AST.TypeField('radius', 'Float', { line: 1 });
    expect(n.type).toBe('TypeField');
    expect(n.name).toBe('radius');
    expect(n.typeAnnotation).toBe('Float');
  });
});

describe('AST — Import nodes', () => {
  test('ImportDeclaration', () => {
    const n = new AST.ImportDeclaration('specifiers', './mod', { line: 1 });
    expect(n.type).toBe('ImportDeclaration');
    expect(n.source).toBe('./mod');
  });

  test('ImportSpecifier', () => {
    const n = new AST.ImportSpecifier('foo', 'bar', { line: 1 });
    expect(n.type).toBe('ImportSpecifier');
    expect(n.imported).toBe('foo');
    expect(n.local).toBe('bar');
  });

  test('ImportDefault', () => {
    const n = new AST.ImportDefault('mod', { line: 1 });
    expect(n.type).toBe('ImportDefault');
    expect(n.local).toBe('mod');
  });

  test('ImportWildcard', () => {
    const n = new AST.ImportWildcard('mod', { line: 1 });
    expect(n.type).toBe('ImportWildcard');
    expect(n.local).toBe('mod');
  });
});

describe('AST — Statement nodes', () => {
  test('BlockStatement', () => {
    const n = new AST.BlockStatement(['s1', 's2'], { line: 1 });
    expect(n.type).toBe('BlockStatement');
    expect(n.body).toHaveLength(2);
  });

  test('ReturnStatement', () => {
    const n = new AST.ReturnStatement('val', { line: 1 });
    expect(n.type).toBe('ReturnStatement');
    expect(n.value).toBe('val');
  });

  test('IfStatement', () => {
    const n = new AST.IfStatement('cond', 'then', [], 'alt', { line: 1 });
    expect(n.type).toBe('IfStatement');
    expect(n.condition).toBe('cond');
    expect(n.consequent).toBe('then');
    expect(n.elseBody).toBe('alt');
  });

  test('ForStatement', () => {
    const n = new AST.ForStatement('item', 'iterable', 'body', null, { line: 1 });
    expect(n.type).toBe('ForStatement');
    expect(n.variable).toBe('item');
    expect(n.iterable).toBe('iterable');
  });

  test('WhileStatement', () => {
    const n = new AST.WhileStatement('cond', 'body', { line: 1 });
    expect(n.type).toBe('WhileStatement');
  });

  test('LoopStatement', () => {
    const n = new AST.LoopStatement('body', { line: 1 });
    expect(n.type).toBe('LoopStatement');
  });

  test('BreakStatement', () => {
    const n = new AST.BreakStatement({ line: 1 });
    expect(n.type).toBe('BreakStatement');
  });

  test('ContinueStatement', () => {
    const n = new AST.ContinueStatement({ line: 1 });
    expect(n.type).toBe('ContinueStatement');
  });

  test('GuardStatement', () => {
    const n = new AST.GuardStatement('cond', 'body', { line: 1 });
    expect(n.type).toBe('GuardStatement');
  });

  test('ExpressionStatement', () => {
    const n = new AST.ExpressionStatement('expr', { line: 1 });
    expect(n.type).toBe('ExpressionStatement');
    expect(n.expression).toBe('expr');
  });

  test('TryCatchStatement', () => {
    const n = new AST.TryCatchStatement('tryBody', 'errVar', 'catchBody', { line: 1 }, 'finalBody');
    expect(n.type).toBe('TryCatchStatement');
    expect(n.finallyBody).toBe('finalBody');
  });
});

describe('AST — Literal nodes', () => {
  test('Identifier', () => {
    const n = new AST.Identifier('x', { line: 1 });
    expect(n.type).toBe('Identifier');
    expect(n.name).toBe('x');
  });

  test('NumberLiteral', () => {
    const n = new AST.NumberLiteral(42, { line: 1 });
    expect(n.type).toBe('NumberLiteral');
    expect(n.value).toBe(42);
  });

  test('StringLiteral', () => {
    const n = new AST.StringLiteral('hello', { line: 1 });
    expect(n.type).toBe('StringLiteral');
    expect(n.value).toBe('hello');
  });

  test('TemplateLiteral', () => {
    const parts = [{ type: 'text', value: 'hello ' }, { type: 'expr', value: 'name' }];
    const n = new AST.TemplateLiteral(parts, { line: 1 });
    expect(n.type).toBe('TemplateLiteral');
    expect(n.parts).toEqual(parts);
  });

  test('BooleanLiteral', () => {
    const t = new AST.BooleanLiteral(true, { line: 1 });
    const f = new AST.BooleanLiteral(false, { line: 1 });
    expect(t.value).toBe(true);
    expect(f.value).toBe(false);
  });

  test('NilLiteral', () => {
    const n = new AST.NilLiteral({ line: 1 });
    expect(n.type).toBe('NilLiteral');
  });

  test('RegexLiteral', () => {
    const n = new AST.RegexLiteral('\\d+', 'g', { line: 1 });
    expect(n.type).toBe('RegexLiteral');
    expect(n.pattern).toBe('\\d+');
    expect(n.flags).toBe('g');
  });

  test('ArrayLiteral', () => {
    const n = new AST.ArrayLiteral([1, 2, 3], { line: 1 });
    expect(n.type).toBe('ArrayLiteral');
    expect(n.elements).toEqual([1, 2, 3]);
  });

  test('ObjectLiteral', () => {
    const n = new AST.ObjectLiteral([['a', 1]], { line: 1 });
    expect(n.type).toBe('ObjectLiteral');
    expect(n.properties).toEqual([['a', 1]]);
  });
});

describe('AST — Expression nodes', () => {
  test('BinaryExpression', () => {
    const n = new AST.BinaryExpression('+', 'left', 'right', { line: 1 });
    expect(n.type).toBe('BinaryExpression');
    expect(n.operator).toBe('+');
  });

  test('UnaryExpression', () => {
    const n = new AST.UnaryExpression('-', 'operand', true, { line: 1 });
    expect(n.type).toBe('UnaryExpression');
    expect(n.prefix).toBe(true);
  });

  test('ChainedComparison', () => {
    const n = new AST.ChainedComparison([1, 2, 3], ['<', '<'], { line: 1 });
    expect(n.type).toBe('ChainedComparison');
    expect(n.operators).toEqual(['<', '<']);
    expect(n.operands).toEqual([1, 2, 3]);
  });

  test('LogicalExpression', () => {
    const n = new AST.LogicalExpression('and', 'left', 'right', { line: 1 });
    expect(n.type).toBe('LogicalExpression');
    expect(n.operator).toBe('and');
  });

  test('CallExpression', () => {
    const n = new AST.CallExpression('fn', ['arg1'], { line: 1 });
    expect(n.type).toBe('CallExpression');
    expect(n.callee).toBe('fn');
    expect(n.arguments).toEqual(['arg1']);
  });

  test('NamedArgument', () => {
    const n = new AST.NamedArgument('key', 'val', { line: 1 });
    expect(n.type).toBe('NamedArgument');
    expect(n.name).toBe('key');
    expect(n.value).toBe('val');
  });

  test('MemberExpression', () => {
    const n = new AST.MemberExpression('obj', 'prop', false, { line: 1 });
    expect(n.type).toBe('MemberExpression');
    expect(n.computed).toBe(false);
  });

  test('OptionalChain', () => {
    const n = new AST.OptionalChain('obj', 'prop', false, { line: 1 });
    expect(n.type).toBe('OptionalChain');
  });

  test('PipeExpression', () => {
    const n = new AST.PipeExpression('left', 'right', { line: 1 });
    expect(n.type).toBe('PipeExpression');
  });

  test('LambdaExpression', () => {
    const n = new AST.LambdaExpression(['x'], 'body', { line: 1 }, false);
    expect(n.type).toBe('LambdaExpression');
    expect(n.isAsync).toBe(false);
  });

  test('MatchExpression', () => {
    const n = new AST.MatchExpression('subject', ['arm1'], { line: 1 });
    expect(n.type).toBe('MatchExpression');
    expect(n.subject).toBe('subject');
  });

  test('MatchArm', () => {
    const n = new AST.MatchArm('pattern', 'guard', 'body', { line: 1 });
    expect(n.type).toBe('MatchArm');
    expect(n.guard).toBe('guard');
    expect(n.body).toBe('body');
  });

  test('SpreadExpression', () => {
    const n = new AST.SpreadExpression('expr', { line: 1 });
    expect(n.type).toBe('SpreadExpression');
  });

  test('PropagateExpression', () => {
    const n = new AST.PropagateExpression('expr', { line: 1 });
    expect(n.type).toBe('PropagateExpression');
  });

  test('AwaitExpression', () => {
    const n = new AST.AwaitExpression('expr', { line: 1 });
    expect(n.type).toBe('AwaitExpression');
  });

  test('IfExpression', () => {
    const n = new AST.IfExpression('cond', 'then', [], 'alt', { line: 1 });
    expect(n.type).toBe('IfExpression');
  });

  test('IsExpression', () => {
    const n = new AST.IsExpression('expr', 'pattern', false, { line: 1 });
    expect(n.type).toBe('IsExpression');
    expect(n.negated).toBe(false);
  });

  test('MembershipExpression', () => {
    const n = new AST.MembershipExpression('elem', 'collection', false, { line: 1 });
    expect(n.type).toBe('MembershipExpression');
    expect(n.negated).toBe(false);
  });

  test('CompoundAssignment', () => {
    const n = new AST.CompoundAssignment('x', '+=', 'val', { line: 1 });
    expect(n.type).toBe('CompoundAssignment');
    expect(n.operator).toBe('+=');
  });

  test('ListComprehension', () => {
    const n = new AST.ListComprehension('expr', 'item', null, 'iter', 'cond', { line: 1 });
    expect(n.type).toBe('ListComprehension');
  });

  test('RangeExpression', () => {
    const n = new AST.RangeExpression(1, 10, true, { line: 1 });
    expect(n.type).toBe('RangeExpression');
    expect(n.inclusive).toBe(true);
  });

  test('SliceExpression', () => {
    const n = new AST.SliceExpression('obj', 'start', 'end', 'step', { line: 1 });
    expect(n.type).toBe('SliceExpression');
  });

  test('YieldExpression', () => {
    const n = new AST.YieldExpression('val', false, { line: 1 });
    expect(n.type).toBe('YieldExpression');
  });

  test('TupleExpression', () => {
    const n = new AST.TupleExpression([1, 2], { line: 1 });
    expect(n.type).toBe('TupleExpression');
  });
});

describe('AST — Pattern nodes', () => {
  test('WildcardPattern', () => {
    const n = new AST.WildcardPattern({ line: 1 });
    expect(n.type).toBe('WildcardPattern');
  });

  test('LiteralPattern', () => {
    const n = new AST.LiteralPattern(42, { line: 1 });
    expect(n.type).toBe('LiteralPattern');
    expect(n.value).toBe(42);
  });

  test('VariantPattern', () => {
    const n = new AST.VariantPattern('Some', ['x'], { line: 1 });
    expect(n.type).toBe('VariantPattern');
    expect(n.name).toBe('Some');
    expect(n.fields).toEqual(['x']);
  });

  test('BindingPattern', () => {
    const n = new AST.BindingPattern('x', { line: 1 });
    expect(n.type).toBe('BindingPattern');
    expect(n.name).toBe('x');
  });

  test('RangePattern', () => {
    const n = new AST.RangePattern(1, 10, true, { line: 1 });
    expect(n.type).toBe('RangePattern');
    expect(n.inclusive).toBe(true);
  });

  test('ObjectPattern', () => {
    const n = new AST.ObjectPattern(['a', 'b'], { line: 1 });
    expect(n.type).toBe('ObjectPattern');
    expect(n.properties).toEqual(['a', 'b']);
  });

  test('ArrayPattern', () => {
    const n = new AST.ArrayPattern(['a', 'b'], { line: 1 });
    expect(n.type).toBe('ArrayPattern');
    expect(n.elements).toEqual(['a', 'b']);
  });

  test('StringConcatPattern', () => {
    const n = new AST.StringConcatPattern('prefix', 'rest', { line: 1 });
    expect(n.type).toBe('StringConcatPattern');
    expect(n.prefix).toBe('prefix');
    expect(n.rest).toBe('rest');
  });

  test('TuplePattern', () => {
    const n = new AST.TuplePattern(['a', 'b'], { line: 1 });
    expect(n.type).toBe('TuplePattern');
  });
});

describe('AST — Type annotation nodes', () => {
  test('TypeAnnotation', () => {
    const n = new AST.TypeAnnotation('Int', [], { line: 1 });
    expect(n.type).toBe('TypeAnnotation');
    expect(n.name).toBe('Int');
  });

  test('ArrayTypeAnnotation', () => {
    const n = new AST.ArrayTypeAnnotation('elemType', { line: 1 });
    expect(n.type).toBe('ArrayTypeAnnotation');
  });

  test('FunctionTypeAnnotation', () => {
    const n = new AST.FunctionTypeAnnotation(['Int'], 'String', { line: 1 });
    expect(n.type).toBe('FunctionTypeAnnotation');
  });

  test('UnionTypeAnnotation', () => {
    const n = new AST.UnionTypeAnnotation(['Int', 'String'], { line: 1 });
    expect(n.type).toBe('UnionTypeAnnotation');
    expect(n.members).toEqual(['Int', 'String']);
  });

  test('TupleTypeAnnotation', () => {
    const n = new AST.TupleTypeAnnotation(['Int', 'String'], { line: 1 });
    expect(n.type).toBe('TupleTypeAnnotation');
  });

  test('TypeAlias', () => {
    const n = new AST.TypeAlias('StringOrInt', [], 'unionExpr', { line: 1 });
    expect(n.type).toBe('TypeAlias');
    expect(n.name).toBe('StringOrInt');
  });

  test('RefinementType', () => {
    const n = new AST.RefinementType('PositiveInt', 'baseType', 'pred', { line: 1 });
    expect(n.type).toBe('RefinementType');
    expect(n.name).toBe('PositiveInt');
  });
});

describe('AST — Interface and trait nodes', () => {
  test('InterfaceDeclaration', () => {
    const n = new AST.InterfaceDeclaration('Printable', ['method1'], { line: 1 });
    expect(n.type).toBe('InterfaceDeclaration');
    expect(n.name).toBe('Printable');
  });

  test('ImplDeclaration', () => {
    const n = new AST.ImplDeclaration('MyType', ['method1'], { line: 1 }, 'Printable');
    expect(n.type).toBe('ImplDeclaration');
    expect(n.traitName).toBe('Printable');
    expect(n.typeName).toBe('MyType');
  });

  test('TraitDeclaration', () => {
    const n = new AST.TraitDeclaration('Eq', ['eq'], { line: 1 });
    expect(n.type).toBe('TraitDeclaration');
    expect(n.name).toBe('Eq');
  });
});

describe('AST — JSX nodes', () => {
  test('JSXElement', () => {
    const n = new AST.JSXElement('div', ['attr'], ['child'], false, { line: 1 });
    expect(n.type).toBe('JSXElement');
    expect(n.tag).toBe('div');
  });

  test('JSXAttribute', () => {
    const n = new AST.JSXAttribute('class', 'val', { line: 1 });
    expect(n.type).toBe('JSXAttribute');
  });

  test('JSXSpreadAttribute', () => {
    const n = new AST.JSXSpreadAttribute('expr', { line: 1 });
    expect(n.type).toBe('JSXSpreadAttribute');
  });

  test('JSXFragment', () => {
    const n = new AST.JSXFragment(['child'], { line: 1 });
    expect(n.type).toBe('JSXFragment');
  });

  test('JSXText', () => {
    const n = new AST.JSXText('hello', { line: 1 });
    expect(n.type).toBe('JSXText');
    expect(n.value).toBe('hello');
  });

  test('JSXExpression', () => {
    const n = new AST.JSXExpression('expr', { line: 1 });
    expect(n.type).toBe('JSXExpression');
  });

  test('JSXFor', () => {
    const n = new AST.JSXFor('item', null, 'items', 'body', 'key', { line: 1 });
    expect(n.type).toBe('JSXFor');
  });

  test('JSXIf', () => {
    const n = new AST.JSXIf('cond', 'then', [], 'alt', { line: 1 });
    expect(n.type).toBe('JSXIf');
  });
});

describe('AST — Server-side nodes', () => {
  test('RouteDeclaration', () => {
    const n = new AST.RouteDeclaration('GET', '/api', 'handler', { line: 1 });
    expect(n.type).toBe('RouteDeclaration');
    expect(n.method).toBe('GET');
    expect(n.path).toBe('/api');
  });

  test('MiddlewareDeclaration', () => {
    const n = new AST.MiddlewareDeclaration('authMiddleware', 'body', null, { line: 1 });
    expect(n.type).toBe('MiddlewareDeclaration');
  });

  test('DiscoverDeclaration', () => {
    const n = new AST.DiscoverDeclaration('peer', 'url', { line: 1 }, null);
    expect(n.type).toBe('DiscoverDeclaration');
    expect(n.peerName).toBe('peer');
  });

  test('TestBlock', () => {
    const n = new AST.TestBlock('my test', 'body', { line: 1 });
    expect(n.type).toBe('TestBlock');
    expect(n.name).toBe('my test');
  });

  test('ExternDeclaration', () => {
    const n = new AST.ExternDeclaration('fetch', [], null, { line: 1 });
    expect(n.type).toBe('ExternDeclaration');
    expect(n.name).toBe('fetch');
    expect(n.params).toEqual([]);
  });
});

describe('AST — Reactive nodes', () => {
  test('StateDeclaration', () => {
    const n = new AST.StateDeclaration('count', null, 0, { line: 1 });
    expect(n.type).toBe('StateDeclaration');
    expect(n.name).toBe('count');
    expect(n.initialValue).toBe(0);
  });

  test('ComputedDeclaration', () => {
    const n = new AST.ComputedDeclaration('doubled', 'expr', { line: 1 });
    expect(n.type).toBe('ComputedDeclaration');
  });

  test('EffectDeclaration', () => {
    const n = new AST.EffectDeclaration('body', ['dep'], { line: 1 });
    expect(n.type).toBe('EffectDeclaration');
  });

  test('ComponentDeclaration', () => {
    const n = new AST.ComponentDeclaration('App', ['prop'], 'body', { line: 1 });
    expect(n.type).toBe('ComponentDeclaration');
    expect(n.name).toBe('App');
  });

  test('StoreDeclaration', () => {
    const n = new AST.StoreDeclaration('appStore', ['state'], ['action'], ['getter'], { line: 1 });
    expect(n.type).toBe('StoreDeclaration');
  });
});

describe('AST — Data pipeline nodes', () => {
  test('ColumnExpression', () => {
    const n = new AST.ColumnExpression('name', { line: 1 });
    expect(n.type).toBe('ColumnExpression');
    expect(n.name).toBe('name');
  });

  test('DataBlock', () => {
    const n = new AST.DataBlock('body', { line: 1 });
    expect(n.type).toBe('DataBlock');
  });
});

describe('AST — Misc nodes', () => {
  test('WithStatement', () => {
    const n = new AST.WithStatement('expr', 'var', 'body', { line: 1 });
    expect(n.type).toBe('WithStatement');
  });

  test('DeferStatement', () => {
    const n = new AST.DeferStatement('body', { line: 1 });
    expect(n.type).toBe('DeferStatement');
  });

  test('LetDestructure', () => {
    const n = new AST.LetDestructure('pattern', 'value', { line: 1 });
    expect(n.type).toBe('LetDestructure');
  });

  test('AiConfigDeclaration', () => {
    const n = new AST.AiConfigDeclaration('myAI', { model: 'gpt-4' }, { line: 1 });
    expect(n.type).toBe('AiConfigDeclaration');
    expect(n.name).toBe('myAI');
  });
});
