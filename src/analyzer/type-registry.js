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
}
