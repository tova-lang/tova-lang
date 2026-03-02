// Animate-specific AST Node definitions for the Tova language
// Extracted for lazy loading — only loaded when animate { } blocks are used.

// ============================================================
// Animate-specific nodes
// ============================================================

export class AnimateDeclaration {
  constructor(name, enter, exit, duration, easing, stagger, stay, loc) {
    this.type = 'AnimateDeclaration';
    this.name = name;       // string — animation name, e.g. "fadeIn"
    this.enter = enter;     // AnimatePrimitive|AnimateSequence|AnimateParallel|null
    this.exit = exit;       // AnimatePrimitive|AnimateSequence|AnimateParallel|null
    this.duration = duration; // number|null — duration in ms
    this.easing = easing;   // string|null — CSS easing function
    this.stagger = stagger; // number|null — stagger delay in ms
    this.stay = stay;       // number|null — auto-dismiss delay in ms
    this.loc = loc;
  }
}

export class AnimatePrimitive {
  constructor(name, params, loc) {
    this.type = 'AnimatePrimitive';
    this.name = name;       // 'fade'|'slide'|'scale'|'rotate'|'blur'
    this.params = params;   // object e.g. {from: 0, to: 1, y: 20}
    this.loc = loc;
  }
}

export class AnimateSequence {
  constructor(children, loc) {
    this.type = 'AnimateSequence';
    this.children = children; // AnimatePrimitive[] or AnimateParallel[]
    this.loc = loc;
  }
}

export class AnimateParallel {
  constructor(children, loc) {
    this.type = 'AnimateParallel';
    this.children = children; // AnimatePrimitive[]
    this.loc = loc;
  }
}
