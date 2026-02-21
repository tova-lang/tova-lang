import { describe, test, expect } from 'bun:test';
import {
  Type, PrimitiveType, NilType, AnyType, UnknownType,
  ArrayType, TupleType, FunctionType, RecordType, ADTType,
  GenericType, TypeVariable, UnionType,
  typeAnnotationToType, typeFromString, typesCompatible,
  isNumericType, isFloatNarrowing,
} from '../src/analyzer/types.js';

// ─── Primitive Types ──────────────────────────────────────

describe('Type System — Primitive Types', () => {
  test('singleton caching', () => {
    expect(Type.INT).toBeInstanceOf(PrimitiveType);
    expect(Type.FLOAT).toBeInstanceOf(PrimitiveType);
    expect(Type.STRING).toBeInstanceOf(PrimitiveType);
    expect(Type.BOOL).toBeInstanceOf(PrimitiveType);
    expect(Type.NIL).toBeInstanceOf(NilType);
    expect(Type.ANY).toBeInstanceOf(AnyType);
    expect(Type.UNKNOWN).toBeInstanceOf(UnknownType);
  });

  test('equality', () => {
    expect(Type.INT.equals(Type.INT)).toBe(true);
    expect(Type.INT.equals(new PrimitiveType('Int'))).toBe(true);
    expect(Type.INT.equals(Type.FLOAT)).toBe(false);
    expect(Type.INT.equals(Type.STRING)).toBe(false);
  });

  test('toString matches string-based representation', () => {
    expect(Type.INT.toString()).toBe('Int');
    expect(Type.FLOAT.toString()).toBe('Float');
    expect(Type.STRING.toString()).toBe('String');
    expect(Type.BOOL.toString()).toBe('Bool');
    expect(Type.NIL.toString()).toBe('Nil');
    expect(Type.ANY.toString()).toBe('Any');
    expect(Type.UNKNOWN.toString()).toBe('unknown');
  });

  test('assignability — same type', () => {
    expect(Type.INT.isAssignableTo(Type.INT)).toBe(true);
    expect(Type.STRING.isAssignableTo(Type.STRING)).toBe(true);
  });

  test('assignability — Int widening to Float', () => {
    expect(Type.INT.isAssignableTo(Type.FLOAT)).toBe(true);
  });

  test('assignability — Float to Int requires explicit conversion', () => {
    expect(Type.FLOAT.isAssignableTo(Type.INT)).toBe(false);
  });

  test('assignability — to Any', () => {
    expect(Type.INT.isAssignableTo(Type.ANY)).toBe(true);
    expect(Type.STRING.isAssignableTo(Type.ANY)).toBe(true);
  });

  test('assignability — to Unknown', () => {
    expect(Type.INT.isAssignableTo(Type.UNKNOWN)).toBe(true);
  });

  test('non-assignability — incompatible', () => {
    expect(Type.INT.isAssignableTo(Type.STRING)).toBe(false);
    expect(Type.STRING.isAssignableTo(Type.BOOL)).toBe(false);
  });
});

// ─── Nil Type ─────────────────────────────────────────────

describe('Type System — Nil Type', () => {
  test('Nil is assignable to Option', () => {
    const optionType = new GenericType('Option', [Type.INT]);
    expect(Type.NIL.isAssignableTo(optionType)).toBe(true);
  });

  test('Nil is assignable to plain Option', () => {
    const optionType = new PrimitiveType('Option');
    expect(Type.NIL.isAssignableTo(optionType)).toBe(true);
  });

  test('Nil is not assignable to Int', () => {
    expect(Type.NIL.isAssignableTo(Type.INT)).toBe(false);
  });
});

// ─── Array Type ───────────────────────────────────────────

describe('Type System — Array Type', () => {
  test('toString', () => {
    expect(new ArrayType(Type.INT).toString()).toBe('[Int]');
    expect(new ArrayType(Type.STRING).toString()).toBe('[String]');
  });

  test('equality', () => {
    expect(new ArrayType(Type.INT).equals(new ArrayType(Type.INT))).toBe(true);
    expect(new ArrayType(Type.INT).equals(new ArrayType(Type.STRING))).toBe(false);
  });

  test('assignability', () => {
    expect(new ArrayType(Type.INT).isAssignableTo(new ArrayType(Type.INT))).toBe(true);
    expect(new ArrayType(Type.INT).isAssignableTo(new ArrayType(Type.FLOAT))).toBe(true);
    expect(new ArrayType(Type.INT).isAssignableTo(new ArrayType(Type.STRING))).toBe(false);
  });
});

// ─── Tuple Type ───────────────────────────────────────────

describe('Type System — Tuple Type', () => {
  test('toString', () => {
    expect(new TupleType([Type.INT, Type.STRING]).toString()).toBe('(Int, String)');
  });

  test('equality', () => {
    expect(new TupleType([Type.INT, Type.STRING]).equals(
      new TupleType([Type.INT, Type.STRING])
    )).toBe(true);
    expect(new TupleType([Type.INT, Type.STRING]).equals(
      new TupleType([Type.STRING, Type.INT])
    )).toBe(false);
  });

  test('assignability', () => {
    expect(new TupleType([Type.INT, Type.INT]).isAssignableTo(
      new TupleType([Type.INT, Type.INT])
    )).toBe(true);
    expect(new TupleType([Type.INT]).isAssignableTo(
      new TupleType([Type.INT, Type.INT])
    )).toBe(false);
  });
});

// ─── Generic Type ─────────────────────────────────────────

describe('Type System — Generic Type', () => {
  test('toString', () => {
    expect(new GenericType('Result', [Type.INT, Type.STRING]).toString()).toBe('Result<Int, String>');
    expect(new GenericType('Option', [Type.INT]).toString()).toBe('Option<Int>');
    expect(new GenericType('Result', []).toString()).toBe('Result');
  });

  test('equality', () => {
    expect(new GenericType('Result', [Type.INT, Type.STRING]).equals(
      new GenericType('Result', [Type.INT, Type.STRING])
    )).toBe(true);
    expect(new GenericType('Result', [Type.INT, Type.STRING]).equals(
      new GenericType('Result', [Type.STRING, Type.INT])
    )).toBe(false);
  });

  test('assignability — gradual typing with bare generics', () => {
    const full = new GenericType('Result', [Type.INT, Type.STRING]);
    const bare = new GenericType('Result', []);
    expect(full.isAssignableTo(bare)).toBe(true);
    expect(bare.isAssignableTo(full)).toBe(true);
  });

  test('assignability — to primitive with same name', () => {
    const result = new GenericType('Result', [Type.INT, Type.STRING]);
    const resultPrim = new PrimitiveType('Result');
    expect(result.isAssignableTo(resultPrim)).toBe(true);
  });
});

// ─── ADT Type ─────────────────────────────────────────────

describe('Type System — ADT Type', () => {
  test('basic construction', () => {
    const variants = new Map([
      ['Circle', new Map([['radius', Type.FLOAT]])],
      ['Rectangle', new Map([['width', Type.FLOAT], ['height', Type.FLOAT]])],
    ]);
    const shape = new ADTType('Shape', [], variants);
    expect(shape.name).toBe('Shape');
    expect(shape.getVariantNames()).toEqual(['Circle', 'Rectangle']);
  });

  test('getFieldType', () => {
    const variants = new Map([
      ['Circle', new Map([['radius', Type.FLOAT]])],
    ]);
    const shape = new ADTType('Shape', [], variants);
    expect(shape.getFieldType('radius')).toBe(Type.FLOAT);
    expect(shape.getFieldType('nonexistent')).toBe(null);
  });

  test('toString', () => {
    const shape = new ADTType('Shape', [], new Map());
    expect(shape.toString()).toBe('Shape');

    const result = new ADTType('Result', ['T', 'E'], new Map());
    expect(result.toString()).toBe('Result<T, E>');
  });
});

// ─── Record Type ──────────────────────────────────────────

describe('Type System — Record Type', () => {
  test('basic construction and field access', () => {
    const fields = new Map([['x', Type.INT], ['y', Type.INT]]);
    const point = new RecordType('Point', fields);
    expect(point.getFieldType('x')).toBe(Type.INT);
    expect(point.getFieldType('z')).toBe(null);
    expect(point.toString()).toBe('Point');
  });
});

// ─── Type Variable ────────────────────────────────────────

describe('Type System — Type Variable', () => {
  test('basic behavior', () => {
    const t = new TypeVariable('T');
    expect(t.toString()).toBe('T');
    expect(t.isAssignableTo(Type.INT)).toBe(true);
    expect(t.isAssignableTo(Type.STRING)).toBe(true);
  });
});

// ─── Union Type ───────────────────────────────────────────

describe('Type System — Union Type', () => {
  test('toString', () => {
    const u = new UnionType([Type.INT, Type.STRING]);
    expect(u.toString()).toBe('Int | String');
  });

  test('assignability', () => {
    const u = new UnionType([Type.INT, Type.STRING]);
    // Union is assignable to a type only if all members are
    expect(u.isAssignableTo(Type.ANY)).toBe(true);
    expect(u.isAssignableTo(Type.INT)).toBe(false); // String not assignable to Int
  });
});

// ─── typeFromString ───────────────────────────────────────

describe('typeFromString', () => {
  test('primitives', () => {
    expect(typeFromString('Int')).toBe(Type.INT);
    expect(typeFromString('Float')).toBe(Type.FLOAT);
    expect(typeFromString('String')).toBe(Type.STRING);
    expect(typeFromString('Bool')).toBe(Type.BOOL);
    expect(typeFromString('Nil')).toBe(Type.NIL);
    expect(typeFromString('Any')).toBe(Type.ANY);
  });

  test('array types', () => {
    const arr = typeFromString('[Int]');
    expect(arr).toBeInstanceOf(ArrayType);
    expect(arr.toString()).toBe('[Int]');
  });

  test('tuple types', () => {
    const tup = typeFromString('(Int, String)');
    expect(tup).toBeInstanceOf(TupleType);
    expect(tup.toString()).toBe('(Int, String)');
  });

  test('generic types', () => {
    const res = typeFromString('Result<Int, String>');
    expect(res).toBeInstanceOf(GenericType);
    expect(res.toString()).toBe('Result<Int, String>');
  });

  test('nested generics', () => {
    const nested = typeFromString('Result<Option<Int>, String>');
    expect(nested).toBeInstanceOf(GenericType);
    expect(nested.toString()).toBe('Result<Option<Int>, String>');
  });

  test('null/undefined returns null', () => {
    expect(typeFromString(null)).toBe(null);
    expect(typeFromString(undefined)).toBe(null);
  });

  test('wildcard', () => {
    expect(typeFromString('_')).toBe(Type.UNKNOWN);
  });
});

// ─── typeAnnotationToType ─────────────────────────────────

describe('typeAnnotationToType', () => {
  test('simple TypeAnnotation', () => {
    const t = typeAnnotationToType({ type: 'TypeAnnotation', name: 'Int' });
    expect(t).toBe(Type.INT);
  });

  test('generic TypeAnnotation', () => {
    const t = typeAnnotationToType({
      type: 'TypeAnnotation',
      name: 'Result',
      typeParams: [
        { type: 'TypeAnnotation', name: 'Int' },
        { type: 'TypeAnnotation', name: 'String' },
      ],
    });
    expect(t).toBeInstanceOf(GenericType);
    expect(t.toString()).toBe('Result<Int, String>');
  });

  test('ArrayTypeAnnotation', () => {
    const t = typeAnnotationToType({
      type: 'ArrayTypeAnnotation',
      elementType: { type: 'TypeAnnotation', name: 'String' },
    });
    expect(t).toBeInstanceOf(ArrayType);
    expect(t.toString()).toBe('[String]');
  });

  test('TupleTypeAnnotation', () => {
    const t = typeAnnotationToType({
      type: 'TupleTypeAnnotation',
      elementTypes: [
        { type: 'TypeAnnotation', name: 'Int' },
        { type: 'TypeAnnotation', name: 'Bool' },
      ],
    });
    expect(t).toBeInstanceOf(TupleType);
    expect(t.toString()).toBe('(Int, Bool)');
  });

  test('FunctionTypeAnnotation', () => {
    const t = typeAnnotationToType({ type: 'FunctionTypeAnnotation' });
    expect(t.toString()).toBe('Function');
  });

  test('null returns null', () => {
    expect(typeAnnotationToType(null)).toBe(null);
  });
});

// ─── typesCompatible ──────────────────────────────────────

describe('typesCompatible', () => {
  test('null types are always compatible', () => {
    expect(typesCompatible(null, Type.INT)).toBe(true);
    expect(typesCompatible(Type.INT, null)).toBe(true);
  });

  test('Type objects', () => {
    expect(typesCompatible(Type.INT, Type.INT)).toBe(true);
    expect(typesCompatible(Type.INT, Type.FLOAT)).toBe(false); // Float->Int narrowing not implicit
    expect(typesCompatible(Type.FLOAT, Type.INT)).toBe(true);  // Int->Float widening is safe
    expect(typesCompatible(Type.INT, Type.STRING)).toBe(false);
  });

  test('string bridge', () => {
    expect(typesCompatible('Int', 'Int')).toBe(true);
    expect(typesCompatible('Int', 'Float')).toBe(false); // Float->Int narrowing not implicit
    expect(typesCompatible('Float', 'Int')).toBe(true);  // Int->Float widening is safe
    expect(typesCompatible('Int', 'String')).toBe(false);
  });
});

// ─── isNumericType ────────────────────────────────────────

describe('isNumericType', () => {
  test('Int and Float are numeric', () => {
    expect(isNumericType(Type.INT)).toBe(true);
    expect(isNumericType(Type.FLOAT)).toBe(true);
  });

  test('String is not numeric', () => {
    expect(isNumericType(Type.STRING)).toBe(false);
  });

  test('null is not numeric', () => {
    expect(isNumericType(null)).toBe(false);
  });
});

// ─── isFloatNarrowing ─────────────────────────────────────

describe('isFloatNarrowing', () => {
  test('Float -> Int is narrowing', () => {
    expect(isFloatNarrowing(Type.FLOAT, Type.INT)).toBe(true);
  });

  test('Int -> Float is not narrowing', () => {
    expect(isFloatNarrowing(Type.INT, Type.FLOAT)).toBe(false);
  });

  test('null is not narrowing', () => {
    expect(isFloatNarrowing(null, Type.INT)).toBe(false);
  });
});
