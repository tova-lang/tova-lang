// Type Registry for Tova Language Server
// Provides type-driven completions and member resolution

import { ADTType, RecordType } from './types.js';

export class TypeRegistry {
  constructor() {
    this.types = new Map();    // type name → ADTType | RecordType
    this.impls = new Map();    // type name → [{ name, params, paramTypes, returnType }]
    this.traits = new Map();   // trait name → [{ name, paramTypes, returnType }]
  }

  /**
   * Populate from an analyzer's type registry data.
   */
  static fromAnalyzer(analyzer) {
    const registry = new TypeRegistry();
    if (analyzer.typeRegistry) {
      registry.types = analyzer.typeRegistry.types;
      registry.impls = analyzer.typeRegistry.impls;
      registry.traits = analyzer.typeRegistry.traits;
    }
    return registry;
  }

  /**
   * Get all members (fields + impl methods) for a type name.
   * Used for dot-completion on instances.
   */
  getMembers(typeName) {
    const fields = new Map();
    const methods = [];

    // Get fields from type structure
    const typeStructure = this.types.get(typeName);
    if (typeStructure) {
      if (typeStructure instanceof ADTType) {
        // For ADTs, collect fields from all variants
        for (const [, variantFields] of typeStructure.variants) {
          for (const [fieldName, fieldType] of variantFields) {
            fields.set(fieldName, fieldType);
          }
        }
      } else if (typeStructure instanceof RecordType) {
        for (const [fieldName, fieldType] of typeStructure.fields) {
          fields.set(fieldName, fieldType);
        }
      }
    }

    // Get instance methods (methods with self)
    const implMethods = this.impls.get(typeName);
    if (implMethods) {
      for (const method of implMethods) {
        if (!method.isAssociated) {
          methods.push(method);
        }
      }
    }

    return { fields, methods };
  }

  /**
   * Get associated functions for a type name (functions without self).
   * Used for dot-completion on the type itself (e.g., Point.origin()).
   */
  getAssociatedFunctions(typeName) {
    const functions = [];
    const implMethods = this.impls.get(typeName);
    if (implMethods) {
      for (const method of implMethods) {
        if (method.isAssociated) {
          functions.push(method);
        }
      }
    }
    return functions;
  }

  /**
   * Get variant names for a type (for match completion).
   */
  getVariantNames(typeName) {
    const typeStructure = this.types.get(typeName);
    if (typeStructure instanceof ADTType) {
      return typeStructure.getVariantNames();
    }
    return [];
  }

  /**
   * Extract the base type name from a composite type string.
   * "[Int]" → "Array", "Result<Int, String>" → "Result", "Option<String>" → "Option", "String" → "String"
   */
  static extractBaseType(typeName) {
    if (!typeName) return null;
    if (typeName.startsWith('[') && typeName.endsWith(']')) return 'Array';
    if (typeName.startsWith('Result<') || typeName === 'Result') return 'Result';
    if (typeName.startsWith('Option<') || typeName === 'Option') return 'Option';
    if (typeName.startsWith('Map<') || typeName === 'Map') return 'Map';
    if (typeName.startsWith('Set<') || typeName === 'Set') return 'Set';
    return typeName;
  }

  /**
   * Get built-in members (fields + methods) for a built-in type.
   * Returns { fields: Map, methods: [] } or null if not a built-in type.
   */
  getBuiltinMembers(typeName) {
    const base = TypeRegistry.extractBaseType(typeName);
    const descriptors = TypeRegistry.BUILTIN_MEMBERS[base];
    if (!descriptors) return null;

    const fields = new Map();
    const methods = [];
    for (const d of descriptors) {
      if (d.kind === 'field') {
        fields.set(d.name, d.returnType);
      } else {
        methods.push(d);
      }
    }
    return { fields, methods };
  }
}

// ─── Built-in type member descriptors ──────────────────────────

function field(name, returnType, doc) {
  return { kind: 'field', name, returnType, doc };
}

function method(name, params, returnType, doc) {
  return { kind: 'method', name, params, returnType, doc };
}

TypeRegistry.BUILTIN_MEMBERS = {
  String: [
    field('length', 'Int', 'Number of characters'),
    method('slice', ['start: Int', 'end?: Int'], 'String', 'Extract a section of the string'),
    method('includes', ['search: String'], 'Bool', 'Check if string contains substring'),
    method('indexOf', ['search: String'], 'Int', 'First index of substring, or -1'),
    method('lastIndexOf', ['search: String'], 'Int', 'Last index of substring, or -1'),
    method('startsWith', ['prefix: String'], 'Bool', 'Check if string starts with prefix'),
    method('endsWith', ['suffix: String'], 'Bool', 'Check if string ends with suffix'),
    method('trim', [], 'String', 'Remove whitespace from both ends'),
    method('trimStart', [], 'String', 'Remove whitespace from start'),
    method('trimEnd', [], 'String', 'Remove whitespace from end'),
    method('toUpperCase', [], 'String', 'Convert to uppercase'),
    method('toLowerCase', [], 'String', 'Convert to lowercase'),
    method('split', ['separator: String'], '[String]', 'Split into array of substrings'),
    method('replace', ['search: String', 'replacement: String'], 'String', 'Replace first occurrence'),
    method('replaceAll', ['search: String', 'replacement: String'], 'String', 'Replace all occurrences'),
    method('repeat', ['count: Int'], 'String', 'Repeat the string n times'),
    method('charAt', ['index: Int'], 'String', 'Character at index'),
    method('charCodeAt', ['index: Int'], 'Int', 'Character code at index'),
    method('concat', ['other: String'], 'String', 'Concatenate strings'),
    method('padStart', ['length: Int', 'fill?: String'], 'String', 'Pad from start to length'),
    method('padEnd', ['length: Int', 'fill?: String'], 'String', 'Pad from end to length'),
    method('match', ['pattern: String'], 'Option', 'Match against regex pattern'),
    method('search', ['pattern: String'], 'Int', 'Search for regex pattern'),
    method('toString', [], 'String', 'Convert to string'),
    method('substring', ['start: Int', 'end?: Int'], 'String', 'Extract characters between indices'),
    method('at', ['index: Int'], 'String', 'Character at index (supports negative)'),
  ],
  Array: [
    field('length', 'Int', 'Number of elements'),
    method('push', ['item: T'], 'Int', 'Add element to end, returns new length'),
    method('pop', [], 'T', 'Remove and return last element'),
    method('shift', [], 'T', 'Remove and return first element'),
    method('unshift', ['item: T'], 'Int', 'Add element to start, returns new length'),
    method('splice', ['start: Int', 'deleteCount?: Int'], '[T]', 'Remove/replace elements'),
    method('slice', ['start?: Int', 'end?: Int'], '[T]', 'Extract a section of the array'),
    method('concat', ['other: [T]'], '[T]', 'Merge arrays'),
    method('join', ['separator?: String'], 'String', 'Join elements into string'),
    method('reverse', [], '[T]', 'Reverse array in place'),
    method('sort', ['compareFn?: fn(T, T) -> Int'], '[T]', 'Sort array in place'),
    method('map', ['fn: fn(T) -> U'], '[U]', 'Transform each element'),
    method('filter', ['fn: fn(T) -> Bool'], '[T]', 'Keep elements matching predicate'),
    method('reduce', ['fn: fn(acc, T) -> U', 'initial: U'], 'U', 'Reduce to single value'),
    method('find', ['fn: fn(T) -> Bool'], 'Option', 'Find first matching element'),
    method('findIndex', ['fn: fn(T) -> Bool'], 'Int', 'Index of first match, or -1'),
    method('some', ['fn: fn(T) -> Bool'], 'Bool', 'Check if any element matches'),
    method('every', ['fn: fn(T) -> Bool'], 'Bool', 'Check if all elements match'),
    method('includes', ['item: T'], 'Bool', 'Check if array contains element'),
    method('indexOf', ['item: T'], 'Int', 'First index of element, or -1'),
    method('flat', [], '[T]', 'Flatten one level of nesting'),
    method('flatMap', ['fn: fn(T) -> [U]'], '[U]', 'Map then flatten'),
    method('fill', ['value: T', 'start?: Int', 'end?: Int'], '[T]', 'Fill with value'),
    method('forEach', ['fn: fn(T) -> Nil'], 'Nil', 'Execute function for each element'),
    method('at', ['index: Int'], 'T', 'Element at index (supports negative)'),
  ],
  Result: [
    method('map', ['fn: fn(T) -> U'], 'Result', 'Transform Ok value'),
    method('flatMap', ['fn: fn(T) -> Result'], 'Result', 'Chain Result-returning function'),
    method('andThen', ['fn: fn(T) -> Result'], 'Result', 'Alias for flatMap'),
    method('unwrap', [], 'T', 'Get Ok value or throw on Err'),
    method('unwrapOr', ['default: T'], 'T', 'Get Ok value or return default'),
    method('expect', ['msg: String'], 'T', 'Get Ok value or throw with message'),
    method('isOk', [], 'Bool', 'Check if Result is Ok'),
    method('isErr', [], 'Bool', 'Check if Result is Err'),
    method('mapErr', ['fn: fn(E) -> F'], 'Result', 'Transform Err value'),
    method('unwrapErr', [], 'E', 'Get Err value or throw on Ok'),
    method('or', ['other: Result'], 'Result', 'Return self if Ok, otherwise other'),
    method('and', ['other: Result'], 'Result', 'Return other if Ok, otherwise self'),
    method('context', ['msg: String'], 'Result', 'Add context to Err'),
  ],
  Option: [
    method('map', ['fn: fn(T) -> U'], 'Option', 'Transform Some value'),
    method('flatMap', ['fn: fn(T) -> Option'], 'Option', 'Chain Option-returning function'),
    method('andThen', ['fn: fn(T) -> Option'], 'Option', 'Alias for flatMap'),
    method('unwrap', [], 'T', 'Get Some value or throw on None'),
    method('unwrapOr', ['default: T'], 'T', 'Get Some value or return default'),
    method('expect', ['msg: String'], 'T', 'Get Some value or throw with message'),
    method('isSome', [], 'Bool', 'Check if Option is Some'),
    method('isNone', [], 'Bool', 'Check if Option is None'),
    method('or', ['other: Option'], 'Option', 'Return self if Some, otherwise other'),
    method('and', ['other: Option'], 'Option', 'Return other if Some, otherwise self'),
    method('filter', ['fn: fn(T) -> Bool'], 'Option', 'Keep Some if predicate matches'),
  ],
  Map: [
    field('size', 'Int', 'Number of key-value pairs'),
    method('get', ['key: K'], 'V', 'Get value by key'),
    method('set', ['key: K', 'value: V'], 'Map', 'Set key-value pair'),
    method('has', ['key: K'], 'Bool', 'Check if key exists'),
    method('delete', ['key: K'], 'Bool', 'Remove key-value pair'),
    method('clear', [], 'Nil', 'Remove all entries'),
    method('keys', [], '[K]', 'Get all keys'),
    method('values', [], '[V]', 'Get all values'),
    method('entries', [], '[(K, V)]', 'Get all key-value pairs'),
    method('forEach', ['fn: fn(V, K) -> Nil'], 'Nil', 'Execute function for each entry'),
  ],
  Set: [
    field('size', 'Int', 'Number of elements'),
    method('add', ['value: T'], 'Set', 'Add element'),
    method('has', ['value: T'], 'Bool', 'Check if element exists'),
    method('delete', ['value: T'], 'Bool', 'Remove element'),
    method('clear', [], 'Nil', 'Remove all elements'),
    method('keys', [], '[T]', 'Get all values (alias)'),
    method('values', [], '[T]', 'Get all values'),
    method('entries', [], '[(T, T)]', 'Get all value-value pairs'),
    method('forEach', ['fn: fn(T) -> Nil'], 'Nil', 'Execute function for each element'),
  ],
  Int: [
    method('toString', [], 'String', 'Convert to string'),
    method('toFixed', ['digits?: Int'], 'String', 'Format with fixed decimal places'),
    method('toPrecision', ['precision?: Int'], 'String', 'Format to specified precision'),
  ],
  Float: [
    method('toString', [], 'String', 'Convert to string'),
    method('toFixed', ['digits?: Int'], 'String', 'Format with fixed decimal places'),
    method('toPrecision', ['precision?: Int'], 'String', 'Format to specified precision'),
  ],
};
