// Type system for the Tova analyzer
// Replaces string-based type representations with a proper class hierarchy

export class Type {
  equals(other) { return false; }
  isAssignableTo(target) { return false; }
  toString() { return 'unknown'; }
  getFieldType(name) { return null; }
}

// ─── Primitive Types ──────────────────────────────────────

export class PrimitiveType extends Type {
  constructor(name) {
    super();
    this.name = name;
  }

  equals(other) {
    return other instanceof PrimitiveType && this.name === other.name;
  }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof PrimitiveType) {
      if (this.name === target.name) return true;
      // Int -> Float widening is always allowed
      if (this.name === 'Int' && target.name === 'Float') return true;
      // Float -> Int: allowed in non-strict (checked at call site)
      if (this.name === 'Float' && target.name === 'Int') return true;
    }
    return false;
  }

  toString() { return this.name; }
}

// ─── Nil Type ──────────────────────────────────────────────

export class NilType extends Type {
  equals(other) { return other instanceof NilType; }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof NilType) return true;
    // Nil is compatible with Option types
    if (target instanceof GenericType && target.base === 'Option') return true;
    if (target instanceof PrimitiveType && target.name === 'Option') return true;
    return false;
  }

  toString() { return 'Nil'; }
}

// ─── Any Type ──────────────────────────────────────────────

export class AnyType extends Type {
  equals(other) { return other instanceof AnyType; }
  isAssignableTo(_target) { return true; }
  toString() { return 'Any'; }
}

// ─── Unknown Type (gradual typing — compatible with everything) ────

export class UnknownType extends Type {
  equals(other) { return other instanceof UnknownType; }
  isAssignableTo(_target) { return true; }
  toString() { return 'unknown'; }
}

// ─── Array Type ────────────────────────────────────────────

export class ArrayType extends Type {
  constructor(elementType) {
    super();
    this.elementType = elementType || Type.ANY;
  }

  equals(other) {
    return other instanceof ArrayType && this.elementType.equals(other.elementType);
  }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof ArrayType) {
      return this.elementType.isAssignableTo(target.elementType);
    }
    return false;
  }

  toString() { return `[${this.elementType.toString()}]`; }
}

// ─── Tuple Type ────────────────────────────────────────────

export class TupleType extends Type {
  constructor(elementTypes) {
    super();
    this.elementTypes = elementTypes || [];
  }

  equals(other) {
    if (!(other instanceof TupleType)) return false;
    if (this.elementTypes.length !== other.elementTypes.length) return false;
    return this.elementTypes.every((t, i) => t.equals(other.elementTypes[i]));
  }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof TupleType) {
      if (this.elementTypes.length !== target.elementTypes.length) return false;
      return this.elementTypes.every((t, i) => t.isAssignableTo(target.elementTypes[i]));
    }
    return false;
  }

  toString() {
    return `(${this.elementTypes.map(t => t.toString()).join(', ')})`;
  }
}

// ─── Function Type ─────────────────────────────────────────

export class FunctionType extends Type {
  constructor(paramTypes, returnType) {
    super();
    this.paramTypes = paramTypes || [];
    this.returnType = returnType || Type.ANY;
  }

  equals(other) {
    if (!(other instanceof FunctionType)) return false;
    if (this.paramTypes.length !== other.paramTypes.length) return false;
    if (!this.returnType.equals(other.returnType)) return false;
    return this.paramTypes.every((t, i) => t.equals(other.paramTypes[i]));
  }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof FunctionType) return this.equals(target);
    return false;
  }

  toString() { return 'Function'; }
}

// ─── Record Type ───────────────────────────────────────────

export class RecordType extends Type {
  constructor(name, fields) {
    super();
    this.name = name;
    this.fields = fields || new Map(); // name -> Type
  }

  equals(other) {
    if (!(other instanceof RecordType)) return false;
    return this.name === other.name;
  }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof RecordType) return this.name === target.name;
    if (target instanceof PrimitiveType && target.name === this.name) return true;
    if (target instanceof GenericType && target.base === this.name) return true;
    return false;
  }

  getFieldType(name) {
    return this.fields.get(name) || null;
  }

  toString() { return this.name; }
}

// ─── ADT Type ──────────────────────────────────────────────

export class ADTType extends Type {
  constructor(name, typeParams, variants) {
    super();
    this.name = name;
    this.typeParams = typeParams || [];
    this.variants = variants || new Map(); // variantName -> Map<fieldName, Type>
  }

  equals(other) {
    if (!(other instanceof ADTType)) return false;
    return this.name === other.name;
  }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof ADTType) return this.name === target.name;
    if (target instanceof PrimitiveType && target.name === this.name) return true;
    if (target instanceof GenericType && target.base === this.name) return true;
    return false;
  }

  getFieldType(name) {
    // Look through all variants for the field
    for (const [, fields] of this.variants) {
      if (fields.has(name)) return fields.get(name);
    }
    return null;
  }

  getVariantNames() {
    return [...this.variants.keys()];
  }

  toString() {
    if (this.typeParams.length > 0) {
      return `${this.name}<${this.typeParams.join(', ')}>`;
    }
    return this.name;
  }
}

// ─── Generic Type ──────────────────────────────────────────

export class GenericType extends Type {
  constructor(base, typeArgs) {
    super();
    this.base = base;
    this.typeArgs = typeArgs || [];
  }

  equals(other) {
    if (!(other instanceof GenericType)) return false;
    if (this.base !== other.base) return false;
    if (this.typeArgs.length !== other.typeArgs.length) return false;
    return this.typeArgs.every((t, i) => t.equals(other.typeArgs[i]));
  }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof GenericType) {
      if (this.base !== target.base) return false;
      // If one side has no type args (bare `Result`), compatible (gradual typing)
      if (this.typeArgs.length === 0 || target.typeArgs.length === 0) return true;
      if (this.typeArgs.length !== target.typeArgs.length) return false;
      return this.typeArgs.every((t, i) => t.isAssignableTo(target.typeArgs[i]));
    }
    // Compatible with a PrimitiveType of same base name (e.g. Result<Int, String> assignable to Result)
    if (target instanceof PrimitiveType && target.name === this.base) return true;
    // Compatible with ADTType of same name
    if (target instanceof ADTType && target.name === this.base) return true;
    return false;
  }

  getFieldType(name) {
    // Delegate to the base type if we had structural info — handled via TypeRegistry
    return null;
  }

  toString() {
    if (this.typeArgs.length === 0) return this.base;
    return `${this.base}<${this.typeArgs.map(t => t.toString()).join(', ')}>`;
  }
}

// ─── Type Variable ─────────────────────────────────────────

export class TypeVariable extends Type {
  constructor(name) {
    super();
    this.name = name;
  }

  equals(other) {
    return other instanceof TypeVariable && this.name === other.name;
  }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof TypeVariable) return this.name === target.name;
    // Type variables are compatible with anything (they're placeholders)
    return true;
  }

  toString() { return this.name; }
}

// ─── Union Type ────────────────────────────────────────────

export class UnionType extends Type {
  constructor(members) {
    super();
    this.members = members || [];
  }

  equals(other) {
    if (!(other instanceof UnionType)) return false;
    if (this.members.length !== other.members.length) return false;
    return this.members.every((m, i) => m.equals(other.members[i]));
  }

  isAssignableTo(target) {
    if (!target) return true;
    if (target instanceof AnyType || target instanceof UnknownType) return true;
    if (target instanceof UnionType) {
      // Every member of this must be assignable to some member of target
      return this.members.every(m =>
        target.members.some(t => m.isAssignableTo(t))
      );
    }
    // A union is assignable to T if every member is assignable to T
    return this.members.every(m => m.isAssignableTo(target));
  }

  toString() {
    return this.members.map(m => m.toString()).join(' | ');
  }
}

// ─── Singleton Caching ────────────────────────────────────

Type.INT = new PrimitiveType('Int');
Type.FLOAT = new PrimitiveType('Float');
Type.STRING = new PrimitiveType('String');
Type.BOOL = new PrimitiveType('Bool');
Type.NIL = new NilType();
Type.ANY = new AnyType();
Type.UNKNOWN = new UnknownType();
Type.FUNCTION = new FunctionType([], Type.ANY);

const PRIMITIVE_CACHE = new Map([
  ['Int', Type.INT],
  ['Float', Type.FLOAT],
  ['String', Type.STRING],
  ['Bool', Type.BOOL],
  ['Nil', Type.NIL],
  ['Any', Type.ANY],
]);

// ─── Helper Functions ──────────────────────────────────────

/**
 * Convert a parser TypeAnnotation AST node to a Type object.
 */
export function typeAnnotationToType(ann) {
  if (!ann) return null;
  if (typeof ann === 'string') return typeFromString(ann);

  switch (ann.type) {
    case 'TypeAnnotation': {
      if (ann.typeParams && ann.typeParams.length > 0) {
        const args = ann.typeParams.map(p => typeAnnotationToType(p) || Type.UNKNOWN);
        return new GenericType(ann.name, args);
      }
      return typeFromString(ann.name);
    }
    case 'ArrayTypeAnnotation': {
      const elType = typeAnnotationToType(ann.elementType) || Type.ANY;
      return new ArrayType(elType);
    }
    case 'TupleTypeAnnotation': {
      const elTypes = ann.elementTypes.map(t => typeAnnotationToType(t) || Type.ANY);
      return new TupleType(elTypes);
    }
    case 'FunctionTypeAnnotation':
      return Type.FUNCTION;
    default:
      return null;
  }
}

/**
 * Convert a type string to a Type object.
 * Bridge for migrating existing string-based code.
 */
export function typeFromString(s) {
  if (!s) return null;

  // Check primitive cache
  if (PRIMITIVE_CACHE.has(s)) return PRIMITIVE_CACHE.get(s);

  // Wildcard / underscore
  if (s === '_') return Type.UNKNOWN;

  // Array type: [ElementType]
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1);
    return new ArrayType(typeFromString(inner) || Type.ANY);
  }

  // Tuple type: (Type1, Type2)
  if (s.startsWith('(') && s.endsWith(')')) {
    const inner = s.slice(1, -1);
    const parts = splitTopLevel(inner, ',');
    return new TupleType(parts.map(p => typeFromString(p.trim()) || Type.ANY));
  }

  // Generic type: Result<Int, String>
  const ltIdx = s.indexOf('<');
  if (ltIdx !== -1) {
    const base = s.slice(0, ltIdx);
    const inner = s.slice(ltIdx + 1, s.lastIndexOf('>'));
    const params = splitTopLevel(inner, ',');
    const args = params.map(p => typeFromString(p.trim()) || Type.UNKNOWN);
    return new GenericType(base, args);
  }

  // Named type (user-defined) — treated as a primitive-like name
  return new PrimitiveType(s);
}

/**
 * Split a string on a delimiter at the top level (respecting nested <> and ()).
 */
function splitTopLevel(str, delimiter) {
  const parts = [];
  let depth = 0;
  let parenDepth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === delimiter && depth === 0 && parenDepth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

/**
 * Null-safe type compatibility check.
 * Returns true if source is assignable to target, or if either is null/unknown.
 */
export function typesCompatible(target, source) {
  if (!target || !source) return true;
  if (target instanceof Type && source instanceof Type) {
    return source.isAssignableTo(target);
  }
  // Fallback for string comparison during migration
  if (typeof target === 'string' || typeof source === 'string') {
    const t = typeof target === 'string' ? typeFromString(target) : target;
    const s = typeof source === 'string' ? typeFromString(source) : source;
    if (!t || !s) return true;
    return s.isAssignableTo(t);
  }
  return true;
}

/**
 * Check if a type is numeric (Int or Float)
 */
export function isNumericType(type) {
  if (!type) return false;
  if (type instanceof PrimitiveType) {
    return type.name === 'Int' || type.name === 'Float';
  }
  return false;
}

/**
 * Check strict Float -> Int narrowing.
 * Returns true if this is a Float-to-Int assignment (potential data loss).
 */
export function isFloatNarrowing(source, target) {
  if (!source || !target) return false;
  return (source instanceof PrimitiveType && source.name === 'Float' &&
          target instanceof PrimitiveType && target.name === 'Int');
}
