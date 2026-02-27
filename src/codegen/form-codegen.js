// Form codegen helper functions for the Tova language
// Generates the revealing-module IIFE pattern for form { } blocks.

/**
 * Generate the validator function body for a single field.
 * @param {string} fieldName - The field name (e.g., "email")
 * @param {Array} validators - Array of FormValidator AST nodes
 * @param {Function} genExpression - The codegen's genExpression method (bound)
 * @param {string} indent - Current indentation string
 * @returns {string} The complete validator function source
 */
export function generateValidatorFn(fieldName, validators, genExpression, indent) {
  if (!validators || validators.length === 0) {
    return `${indent}function __validate_${fieldName}(v) { return null; }\n`;
  }

  const lines = [];
  lines.push(`${indent}function __validate_${fieldName}(v) {`);

  for (const v of validators) {
    const msg = v.args.length > 0 ? genExpression(v.args[v.args.length - 1]) : '"Validation failed"';

    switch (v.name) {
      case 'required':
        lines.push(`${indent}  if (v === undefined || v === null || v === "") return ${msg};`);
        break;

      case 'minLength': {
        const len = v.args.length >= 2 ? genExpression(v.args[0]) : '0';
        lines.push(`${indent}  if (typeof v === "string" && v.length < ${len}) return ${msg};`);
        break;
      }

      case 'maxLength': {
        const len = v.args.length >= 2 ? genExpression(v.args[0]) : 'Infinity';
        lines.push(`${indent}  if (typeof v === "string" && v.length > ${len}) return ${msg};`);
        break;
      }

      case 'min': {
        const threshold = v.args.length >= 2 ? genExpression(v.args[0]) : '0';
        lines.push(`${indent}  if (typeof v === "number" && v < ${threshold}) return ${msg};`);
        break;
      }

      case 'max': {
        const threshold = v.args.length >= 2 ? genExpression(v.args[0]) : 'Infinity';
        lines.push(`${indent}  if (typeof v === "number" && v > ${threshold}) return ${msg};`);
        break;
      }

      case 'pattern': {
        const regex = v.args.length >= 2 ? genExpression(v.args[0]) : '/./';
        lines.push(`${indent}  if (typeof v === "string" && !${regex}.test(v)) return ${msg};`);
        break;
      }

      case 'email':
        lines.push(`${indent}  if (typeof v === "string" && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)) return ${msg};`);
        break;

      case 'matches': {
        const siblingField = v.args[0];
        const siblingName = siblingField && (siblingField.name || siblingField);
        const matchMsg = v.args.length >= 2 ? genExpression(v.args[1]) : '"Fields do not match"';
        if (siblingName) {
          lines.push(`${indent}  if (v !== __${siblingName}_value()) return ${matchMsg};`);
        }
        break;
      }

      case 'validate': {
        // Custom validator: validate(fn(v) ...) — the first arg is a lambda/function
        const fn = v.args.length > 0 ? genExpression(v.args[0]) : '(() => null)';
        if (v.isAsync) {
          // Async validators are handled in a later task — emit a comment placeholder
          lines.push(`${indent}  // async validate: ${fn} (deferred to async validation)`);
        } else {
          lines.push(`${indent}  { const __r = ${fn}(v); if (__r) return __r; }`);
        }
        break;
      }

      default:
        // Unknown validator — emit as custom function call for extensibility
        if (v.args.length > 0) {
          const allArgs = v.args.map(a => genExpression(a)).join(', ');
          lines.push(`${indent}  // custom validator: ${v.name}(${allArgs})`);
        }
        break;
    }
  }

  lines.push(`${indent}  return null;`);
  lines.push(`${indent}}`);
  return lines.join('\n') + '\n';
}

/**
 * Generate the three signal pairs + initial const for a field.
 * @param {string} fieldName - The field name
 * @param {string} initialExpr - The generated JS expression for the initial value
 * @param {string} indent - Current indentation string
 * @returns {string} The signal declarations
 */
export function generateFieldSignals(fieldName, initialExpr, indent) {
  const lines = [];
  lines.push(`${indent}const __${fieldName}_initial = ${initialExpr};`);
  lines.push(`${indent}const [__${fieldName}_value, __set_${fieldName}_value] = createSignal(${initialExpr});`);
  lines.push(`${indent}const [__${fieldName}_error, __set_${fieldName}_error] = createSignal(null);`);
  lines.push(`${indent}const [__${fieldName}_touched, __set_${fieldName}_touched] = createSignal(false);`);
  return lines.join('\n') + '\n';
}

/**
 * Generate the field accessor object for a single field.
 * @param {string} fieldName - The field name (may include prefix, e.g., "shipping_street")
 * @param {string} indent - Current indentation string
 * @returns {string} The field accessor object source
 */
export function generateFieldAccessor(fieldName, indent) {
  const lines = [];
  lines.push(`${indent}const ${fieldName} = {`);
  lines.push(`${indent}  get value() { return __${fieldName}_value(); },`);
  lines.push(`${indent}  get error() { return __${fieldName}_error(); },`);
  lines.push(`${indent}  get touched() { return __${fieldName}_touched(); },`);
  lines.push(`${indent}  set(v) { __set_${fieldName}_value(v); if (__${fieldName}_touched()) __set_${fieldName}_error(__validate_${fieldName}(v)); },`);
  lines.push(`${indent}  blur() { __set_${fieldName}_touched(true); __set_${fieldName}_error(__validate_${fieldName}(__${fieldName}_value())); },`);
  lines.push(`${indent}  validate() { const e = __validate_${fieldName}(__${fieldName}_value()); __set_${fieldName}_error(e); return e === null; },`);
  lines.push(`${indent}  reset() { __set_${fieldName}_value(__${fieldName}_initial); __set_${fieldName}_error(null); __set_${fieldName}_touched(false); },`);
  lines.push(`${indent}};`);
  return lines.join('\n') + '\n';
}

/**
 * Generate a conditional guard line for a validator function.
 * When the group condition is false, skip validation (return null).
 * @param {string|null} conditionGuardExpr - JS expression that, when true, means "skip validation"
 * @param {string} indent - Current indentation string
 * @returns {string} The guard line, or empty string if no condition
 */
export function generateConditionGuard(conditionGuardExpr, indent) {
  if (!conditionGuardExpr) return '';
  return `${indent}  if (${conditionGuardExpr}) return null;\n`;
}

/**
 * Generate the validator function with an optional condition guard for groups.
 * @param {string} fieldName - The prefixed field name (e.g., "shipping_street")
 * @param {Array} validators - Array of FormValidator AST nodes
 * @param {Function} genExpression - The codegen's genExpression method (bound)
 * @param {string} indent - Current indentation string
 * @param {string|null} conditionGuardExpr - If non-null, JS expression to guard (skip when truthy)
 * @returns {string} The complete validator function source
 */
export function generateGuardedValidatorFn(fieldName, validators, genExpression, indent, conditionGuardExpr) {
  if (!validators || validators.length === 0) {
    if (conditionGuardExpr) {
      const lines = [];
      lines.push(`${indent}function __validate_${fieldName}(v) {`);
      lines.push(`${indent}  if (${conditionGuardExpr}) return null;`);
      lines.push(`${indent}  return null;`);
      lines.push(`${indent}}`);
      return lines.join('\n') + '\n';
    }
    return `${indent}function __validate_${fieldName}(v) { return null; }\n`;
  }

  const lines = [];
  lines.push(`${indent}function __validate_${fieldName}(v) {`);

  // Insert condition guard before validators
  if (conditionGuardExpr) {
    lines.push(`${indent}  if (${conditionGuardExpr}) return null;`);
  }

  for (const v of validators) {
    const msg = v.args.length > 0 ? genExpression(v.args[v.args.length - 1]) : '"Validation failed"';

    switch (v.name) {
      case 'required':
        lines.push(`${indent}  if (v === undefined || v === null || v === "") return ${msg};`);
        break;

      case 'minLength': {
        const len = v.args.length >= 2 ? genExpression(v.args[0]) : '0';
        lines.push(`${indent}  if (typeof v === "string" && v.length < ${len}) return ${msg};`);
        break;
      }

      case 'maxLength': {
        const len = v.args.length >= 2 ? genExpression(v.args[0]) : 'Infinity';
        lines.push(`${indent}  if (typeof v === "string" && v.length > ${len}) return ${msg};`);
        break;
      }

      case 'min': {
        const threshold = v.args.length >= 2 ? genExpression(v.args[0]) : '0';
        lines.push(`${indent}  if (typeof v === "number" && v < ${threshold}) return ${msg};`);
        break;
      }

      case 'max': {
        const threshold = v.args.length >= 2 ? genExpression(v.args[0]) : 'Infinity';
        lines.push(`${indent}  if (typeof v === "number" && v > ${threshold}) return ${msg};`);
        break;
      }

      case 'pattern': {
        const regex = v.args.length >= 2 ? genExpression(v.args[0]) : '/./';
        lines.push(`${indent}  if (typeof v === "string" && !${regex}.test(v)) return ${msg};`);
        break;
      }

      case 'email':
        lines.push(`${indent}  if (typeof v === "string" && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)) return ${msg};`);
        break;

      case 'matches': {
        const siblingField = v.args[0];
        const siblingName = siblingField && (siblingField.name || siblingField);
        const matchMsg = v.args.length >= 2 ? genExpression(v.args[1]) : '"Fields do not match"';
        if (siblingName) {
          lines.push(`${indent}  if (v !== __${siblingName}_value()) return ${matchMsg};`);
        }
        break;
      }

      case 'validate': {
        const fn = v.args.length > 0 ? genExpression(v.args[0]) : '(() => null)';
        if (v.isAsync) {
          lines.push(`${indent}  // async validate: ${fn} (deferred to async validation)`);
        } else {
          lines.push(`${indent}  { const __r = ${fn}(v); if (__r) return __r; }`);
        }
        break;
      }

      default:
        if (v.args.length > 0) {
          const allArgs = v.args.map(a => genExpression(a)).join(', ');
          lines.push(`${indent}  // custom validator: ${v.name}(${allArgs})`);
        }
        break;
    }
  }

  lines.push(`${indent}  return null;`);
  lines.push(`${indent}}`);
  return lines.join('\n') + '\n';
}

/**
 * Generate the group accessor object.
 * @param {string} groupName - The group name (e.g., "shipping")
 * @param {Array<{name: string, prefixedName: string}>} childFields - Fields in this group with their prefixed signal names
 * @param {Array<string>} childGroupNames - Names of nested sub-group accessors
 * @param {string} indent - Current indentation string
 * @returns {string} The group accessor object source
 */
export function generateGroupAccessor(groupName, childFields, childGroupNames, indent) {
  const lines = [];
  lines.push(`${indent}const ${groupName} = {`);

  // Named field accessors as properties
  for (const f of childFields) {
    lines.push(`${indent}  ${f.name}: ${f.prefixedName},`);
  }

  // Nested group accessors as properties (reference the group's local variable name)
  for (const g of childGroupNames) {
    lines.push(`${indent}  ${g.localName}: ${g.localName},`);
  }

  // get values() — returns object with field values
  const valuesEntries = childFields.map(f => `${f.name}: __${f.prefixedName}_value()`).join(', ');
  lines.push(`${indent}  get values() { return { ${valuesEntries} }; },`);

  // get isValid() — true when all child fields have null errors
  const isValidParts = childFields.map(f => `__${f.prefixedName}_error() === null`);
  const isValidExpr = isValidParts.length > 0 ? isValidParts.join(' && ') : 'true';
  lines.push(`${indent}  get isValid() { return ${isValidExpr}; },`);

  // get isDirty() — true when any child field differs from initial
  const isDirtyParts = childFields.map(f => `__${f.prefixedName}_value() !== __${f.prefixedName}_initial`);
  const isDirtyExpr = isDirtyParts.length > 0 ? isDirtyParts.join(' || ') : 'false';
  lines.push(`${indent}  get isDirty() { return ${isDirtyExpr}; },`);

  // reset() — resets all child fields
  const resetCalls = childFields.map(f => `${f.prefixedName}.reset()`).join('; ');
  lines.push(`${indent}  reset() { ${resetCalls}; },`);

  lines.push(`${indent}};`);
  return lines.join('\n') + '\n';
}

/**
 * Generate a condition expression where form field identifiers are replaced
 * with their signal value calls (__fieldName_value()).
 * @param {Object} condNode - The condition AST node
 * @param {Function} genExpression - The codegen's genExpression method (bound)
 * @param {Set<string>} formFieldNames - Set of all known form field names (top-level)
 * @returns {string} The JS expression with field references replaced by signal calls
 */
export function generateConditionExpr(condNode, genExpression, formFieldNames) {
  if (!condNode) return 'true';

  // For identifier nodes that reference form fields, generate signal value calls
  if (condNode.type === 'Identifier' && formFieldNames.has(condNode.name)) {
    return `__${condNode.name}_value()`;
  }

  // For unary not: recurse into the operand
  if (condNode.type === 'UnaryExpression' && (condNode.operator === 'not' || condNode.operator === '!')) {
    const operand = generateConditionExpr(condNode.operand, genExpression, formFieldNames);
    return `(!${operand})`;
  }

  // For binary/logical expressions: recurse into both sides
  if (condNode.type === 'BinaryExpression' || condNode.type === 'LogicalExpression') {
    const left = generateConditionExpr(condNode.left, genExpression, formFieldNames);
    const right = generateConditionExpr(condNode.right, genExpression, formFieldNames);
    const op = condNode.operator === 'and' ? '&&' : condNode.operator === 'or' ? '||' : condNode.operator;
    return `(${left} ${op} ${right})`;
  }

  // Fallback: use the standard genExpression
  return genExpression(condNode);
}

/**
 * Recursively generate all code for a form group (signals, validators, accessors, group accessor).
 * Collects all prefixed field names into the provided allFields array for form-level computeds.
 * @param {Object} group - FormGroupDeclaration AST node
 * @param {string} prefix - Current prefix (e.g., "shipping_" or "billing_address_")
 * @param {Function} genExpression - The codegen's genExpression method (bound)
 * @param {string} indent - Current indentation string
 * @param {Array<string>} allPrefixedNames - Accumulator for all prefixed field names (for form-level isValid/isDirty)
 * @param {string|null} conditionGuardExpr - JS expression to guard validators (from conditional group)
 * @param {Array<{groupName: string, condExpr: string|null}>} conditionalGroups - Accumulator for conditional group info
 * @param {Set<string>} formFieldNames - Set of all top-level form field names (for condition expression resolution)
 * @returns {string} The complete generated code for this group
 */
export function generateGroupCode(group, prefix, genExpression, indent, allPrefixedNames, conditionGuardExpr, conditionalGroups, formFieldNames) {
  const p = [];
  const groupPrefix = prefix + group.name + '_';

  // Determine condition guard for this group's validators
  let guardExpr = conditionGuardExpr || null;
  if (group.condition) {
    // Generate the condition expression with field references resolved to signal value calls
    const condExpr = generateConditionExpr(group.condition, genExpression, formFieldNames || new Set());
    // Guard: when condition is false, skip validation
    const thisGuard = `!(${condExpr})`;
    // Combine with parent guard if any
    guardExpr = conditionGuardExpr ? `${conditionGuardExpr} || ${thisGuard}` : thisGuard;

    // Track this conditional group for form-level isValid
    conditionalGroups.push({ groupPrefix, condExpr });
  }

  // Child field info for the group accessor
  const childFields = [];

  // Generate signals, validators, and accessors for each field
  for (const field of group.fields) {
    const prefixedName = groupPrefix + field.name;
    const init = field.initialValue ? genExpression(field.initialValue) : 'null';

    p.push(generateFieldSignals(prefixedName, init, indent));
    p.push(generateGuardedValidatorFn(prefixedName, field.validators, genExpression, indent, guardExpr));
    p.push(generateFieldAccessor(prefixedName, indent));

    allPrefixedNames.push(prefixedName);
    childFields.push({ name: field.name, prefixedName });
  }

  // Recurse into nested groups
  const childGroupNames = [];
  for (const subGroup of (group.groups || [])) {
    p.push(generateGroupCode(subGroup, groupPrefix, genExpression, indent, allPrefixedNames, guardExpr, conditionalGroups, formFieldNames));
    childGroupNames.push({ localName: subGroup.name, prefixedName: groupPrefix + subGroup.name });
  }

  // Generate the group accessor object
  p.push(generateGroupAccessor(group.name, childFields, childGroupNames, indent));

  return p.join('');
}

/**
 * Generate the complete code for a form array declaration.
 * Produces:
 *   - Items list signal (createSignal([]))
 *   - Auto-increment ID counter
 *   - Item factory function (with signal-backed fields, validators, accessors)
 *   - Array accessor object (items, length, add, remove, move)
 *
 * @param {Object} arrayDecl - FormArrayDeclaration AST node
 * @param {Function} genExpression - The codegen's genExpression method (bound)
 * @param {string} indent - Current indentation string
 * @returns {string} The complete generated code for this array
 */
export function generateArrayCode(arrayDecl, genExpression, indent) {
  const name = arrayDecl.name;
  const fields = arrayDecl.fields || [];
  const p = [];

  // Items list signal
  p.push(`${indent}const [__${name}, __set_${name}] = createSignal([]);\n`);
  p.push(`${indent}let __${name}_nextId = 0;\n\n`);

  // Item factory function
  p.push(`${indent}function __create${capitalize(name)}Item(defaults) {\n`);
  const fi = indent + '  '; // factory indent

  p.push(`${fi}const __id = __${name}_nextId++;\n`);

  // For each field: initial value, signals, validator, accessor
  for (const field of fields) {
    const fname = field.name;
    const defaultVal = field.initialValue ? genExpression(field.initialValue) : 'null';

    // Initial value (from defaults param or field default)
    p.push(`${fi}const __${fname}_initial = (defaults && defaults.${fname} !== undefined) ? defaults.${fname} : ${defaultVal};\n`);

    // Signals
    p.push(`${fi}const [__${fname}_value, __set_${fname}_value] = createSignal(__${fname}_initial);\n`);
    p.push(`${fi}const [__${fname}_error, __set_${fname}_error] = createSignal(null);\n`);
    p.push(`${fi}const [__${fname}_touched, __set_${fname}_touched] = createSignal(false);\n`);
    p.push(`\n`);
  }

  // Validator functions for each field
  for (const field of fields) {
    p.push(generateValidatorFn(field.name, field.validators, genExpression, fi));
  }

  // Return the item object with field accessors
  p.push(`${fi}return {\n`);
  const ri = fi + '  '; // return indent

  p.push(`${ri}__id,\n`);

  for (const field of fields) {
    const fname = field.name;
    p.push(`${ri}${fname}: {\n`);
    const ai = ri + '  '; // accessor indent
    p.push(`${ai}get value() { return __${fname}_value(); },\n`);
    p.push(`${ai}get error() { return __${fname}_error(); },\n`);
    p.push(`${ai}get touched() { return __${fname}_touched(); },\n`);
    p.push(`${ai}set(v) { __set_${fname}_value(v); if (__${fname}_touched()) __set_${fname}_error(__validate_${fname}(v)); },\n`);
    p.push(`${ai}blur() { __set_${fname}_touched(true); __set_${fname}_error(__validate_${fname}(__${fname}_value())); },\n`);
    p.push(`${ai}validate() { const e = __validate_${fname}(__${fname}_value()); __set_${fname}_error(e); return e === null; },\n`);
    p.push(`${ai}reset() { __set_${fname}_value(__${fname}_initial); __set_${fname}_error(null); __set_${fname}_touched(false); },\n`);
    p.push(`${ri}},\n`);
  }

  // Item-level values getter
  const valuesEntries = fields.map(f => `${f.name}: __${f.name}_value()`).join(', ');
  p.push(`${ri}get values() { return { ${valuesEntries} }; },\n`);

  // Item-level isValid getter
  const isValidParts = fields.map(f => `__${f.name}_error() === null`);
  const isValidExpr = isValidParts.length > 0 ? isValidParts.join(' && ') : 'true';
  p.push(`${ri}get isValid() { return ${isValidExpr}; },\n`);

  p.push(`${fi}};\n`);
  p.push(`${indent}}\n\n`);

  // Array accessor object
  p.push(`${indent}const ${name} = {\n`);
  const oi = indent + '  '; // object indent

  p.push(`${oi}get items() { return __${name}(); },\n`);
  p.push(`${oi}get length() { return __${name}().length; },\n`);

  // add(defaults)
  p.push(`${oi}add(defaults) {\n`);
  p.push(`${oi}  const item = __create${capitalize(name)}Item(defaults);\n`);
  p.push(`${oi}  __set_${name}(prev => [...prev, item]);\n`);
  p.push(`${oi}  return item;\n`);
  p.push(`${oi}},\n`);

  // remove(item)
  p.push(`${oi}remove(item) {\n`);
  p.push(`${oi}  __set_${name}(prev => prev.filter(i => i.__id !== item.__id));\n`);
  p.push(`${oi}},\n`);

  // move(from, to)
  p.push(`${oi}move(from, to) {\n`);
  p.push(`${oi}  __set_${name}(prev => {\n`);
  p.push(`${oi}    const arr = [...prev];\n`);
  p.push(`${oi}    const [moved] = arr.splice(from, 1);\n`);
  p.push(`${oi}    arr.splice(to, 0, moved);\n`);
  p.push(`${oi}    return arr;\n`);
  p.push(`${oi}  });\n`);
  p.push(`${oi}},\n`);

  p.push(`${indent}};\n`);

  return p.join('');
}

/**
 * Generate a createEffect that debounces an async validator for a form field.
 * The effect:
 * 1. Watches the field's value signal
 * 2. Debounces with setTimeout (300ms)
 * 3. Runs the async validation function
 * 4. Uses a version counter to discard stale results
 * 5. Sets the error signal with the result
 *
 * @param {string} fieldName - The field name (e.g., "email")
 * @param {Object} asyncValidator - The FormValidator AST node with isAsync: true
 * @param {Function} genExpression - The codegen's genExpression method (bound)
 * @param {string} indent - Current indentation string
 * @returns {string} The complete async validator effect source
 */
export function generateAsyncValidatorEffect(fieldName, asyncValidator, genExpression, indent = '  ') {
  const fn = genExpression(asyncValidator.args[0]); // The async validation function
  const lines = [];
  lines.push(`${indent}let __${fieldName}_asyncVersion = 0;`);
  lines.push(`${indent}let __${fieldName}_asyncTimer = null;`);
  lines.push(`${indent}createEffect(() => {`);
  lines.push(`${indent}  const v = __${fieldName}_value();`);
  lines.push(`${indent}  if (__${fieldName}_asyncTimer) clearTimeout(__${fieldName}_asyncTimer);`);
  lines.push(`${indent}  const version = ++__${fieldName}_asyncVersion;`);
  lines.push(`${indent}  __${fieldName}_asyncTimer = setTimeout(async () => {`);
  lines.push(`${indent}    try {`);
  lines.push(`${indent}      const err = await (${fn})(v);`);
  lines.push(`${indent}      if (version === __${fieldName}_asyncVersion) {`);
  lines.push(`${indent}        __set_${fieldName}_error(err || null);`);
  lines.push(`${indent}      }`);
  lines.push(`${indent}    } catch(e) {`);
  lines.push(`${indent}      if (version === __${fieldName}_asyncVersion) {`);
  lines.push(`${indent}        __set_${fieldName}_error(e.message || "Validation error");`);
  lines.push(`${indent}      }`);
  lines.push(`${indent}    }`);
  lines.push(`${indent}  }, 300);`);
  lines.push(`${indent}});`);
  return lines.join('\n');
}

/**
 * Capitalize the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
