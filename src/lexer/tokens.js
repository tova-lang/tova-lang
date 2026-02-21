// Token type definitions for the Tova language

export const TokenType = {
  // Literals
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  STRING_TEMPLATE: 'STRING_TEMPLATE',
  BOOLEAN: 'BOOLEAN',
  NIL: 'NIL',
  IDENTIFIER: 'IDENTIFIER',

  // Keywords
  VAR: 'VAR',
  LET: 'LET',
  FN: 'FN',
  RETURN: 'RETURN',
  IF: 'IF',
  ELIF: 'ELIF',
  ELSE: 'ELSE',
  FOR: 'FOR',
  WHILE: 'WHILE',
  MATCH: 'MATCH',
  TYPE: 'TYPE',
  IMPORT: 'IMPORT',
  FROM: 'FROM',
  EXPORT: 'EXPORT',
  AS: 'AS',

  // Boolean / logic keywords
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  IN: 'IN',
  TRUE: 'TRUE',
  FALSE: 'FALSE',

  // Control flow
  BREAK: 'BREAK',
  CONTINUE: 'CONTINUE',

  // Error handling
  TRY: 'TRY',
  CATCH: 'CATCH',
  FINALLY: 'FINALLY',

  // Async
  ASYNC: 'ASYNC',
  AWAIT: 'AWAIT',

  // Guard
  GUARD: 'GUARD',

  // Interface
  INTERFACE: 'INTERFACE',
  DERIVE: 'DERIVE',

  // Visibility
  PUB: 'PUB',

  // Impl blocks / traits
  IMPL: 'IMPL',
  TRAIT: 'TRAIT',

  // Defer
  DEFER: 'DEFER',

  // Mutable (alias for var)
  MUT: 'MUT',

  // Loop
  LOOP: 'LOOP',
  WHEN: 'WHEN',

  // Generators
  YIELD: 'YIELD',

  // Extern
  EXTERN: 'EXTERN',

  // Type checking
  IS: 'IS',

  // Resource management
  WITH: 'WITH',

  // Full-stack keywords
  SERVER: 'SERVER',
  CLIENT: 'CLIENT',
  SHARED: 'SHARED',
  ROUTE: 'ROUTE',
  STATE: 'STATE',
  COMPUTED: 'COMPUTED',
  EFFECT: 'EFFECT',
  COMPONENT: 'COMPONENT',
  STORE: 'STORE',
  STYLE_BLOCK: 'STYLE_BLOCK',

  // HTTP methods (used in route declarations)
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',

  // Operators
  PLUS: 'PLUS',               // +
  MINUS: 'MINUS',             // -
  STAR: 'STAR',               // *
  SLASH: 'SLASH',             // /
  PERCENT: 'PERCENT',         // %
  POWER: 'POWER',             // **
  ASSIGN: 'ASSIGN',           // =
  EQUAL: 'EQUAL',             // ==
  NOT_EQUAL: 'NOT_EQUAL',     // !=
  LESS: 'LESS',               // <
  LESS_EQUAL: 'LESS_EQUAL',   // <=
  GREATER: 'GREATER',         // >
  GREATER_EQUAL: 'GREATER_EQUAL', // >=
  AND_AND: 'AND_AND',         // &&
  OR_OR: 'OR_OR',             // ||
  BANG: 'BANG',                // !
  PIPE: 'PIPE',               // |>
  BAR: 'BAR',                 // |
  ARROW: 'ARROW',             // =>
  THIN_ARROW: 'THIN_ARROW',   // ->
  DOT: 'DOT',                 // .
  DOT_DOT: 'DOT_DOT',        // ..
  DOT_DOT_EQUAL: 'DOT_DOT_EQUAL', // ..=
  SPREAD: 'SPREAD',           // ...
  COLON: 'COLON',             // :
  DOUBLE_COLON: 'DOUBLE_COLON', // ::
  QUESTION: 'QUESTION',       // ?
  QUESTION_DOT: 'QUESTION_DOT', // ?.
  QUESTION_QUESTION: 'QUESTION_QUESTION', // ??
  PLUS_ASSIGN: 'PLUS_ASSIGN', // +=
  MINUS_ASSIGN: 'MINUS_ASSIGN', // -=
  STAR_ASSIGN: 'STAR_ASSIGN', // *=
  SLASH_ASSIGN: 'SLASH_ASSIGN', // /=

  // Delimiters
  LPAREN: 'LPAREN',           // (
  RPAREN: 'RPAREN',           // )
  LBRACE: 'LBRACE',           // {
  RBRACE: 'RBRACE',           // }
  LBRACKET: 'LBRACKET',       // [
  RBRACKET: 'RBRACKET',       // ]
  COMMA: 'COMMA',             // ,
  SEMICOLON: 'SEMICOLON',     // ;
  NEWLINE: 'NEWLINE',         // \n (significant in some contexts)

  // JSX
  JSX_OPEN: 'JSX_OPEN',       // <tag
  JSX_CLOSE: 'JSX_CLOSE',     // </tag>
  JSX_SELF_CLOSE: 'JSX_SELF_CLOSE', // />
  JSX_TEXT: 'JSX_TEXT',

  // Regex
  REGEX: 'REGEX',             // /pattern/flags

  // Special
  EOF: 'EOF',
  DOCSTRING: 'DOCSTRING',     // /// comment
};

// Keywords map for quick lookup during lexing
export const Keywords = {
  'var': TokenType.VAR,
  'let': TokenType.LET,
  'fn': TokenType.FN,
  'return': TokenType.RETURN,
  'if': TokenType.IF,
  'elif': TokenType.ELIF,
  'else': TokenType.ELSE,
  'for': TokenType.FOR,
  'while': TokenType.WHILE,
  'match': TokenType.MATCH,
  'type': TokenType.TYPE,
  'import': TokenType.IMPORT,
  'from': TokenType.FROM,
  'export': TokenType.EXPORT,
  'as': TokenType.AS,
  'and': TokenType.AND,
  'or': TokenType.OR,
  'not': TokenType.NOT,
  'in': TokenType.IN,
  'true': TokenType.TRUE,
  'false': TokenType.FALSE,
  'nil': TokenType.NIL,
  'break': TokenType.BREAK,
  'continue': TokenType.CONTINUE,
  'try': TokenType.TRY,
  'catch': TokenType.CATCH,
  'finally': TokenType.FINALLY,
  'async': TokenType.ASYNC,
  'await': TokenType.AWAIT,
  'guard': TokenType.GUARD,
  'interface': TokenType.INTERFACE,
  'derive': TokenType.DERIVE,
  'pub': TokenType.PUB,
  'impl': TokenType.IMPL,
  'trait': TokenType.TRAIT,
  'defer': TokenType.DEFER,
  'mut': TokenType.MUT,
  'yield': TokenType.YIELD,
  'loop': TokenType.LOOP,
  'when': TokenType.WHEN,
  'extern': TokenType.EXTERN,
  'is': TokenType.IS,
  'with': TokenType.WITH,
  'server': TokenType.SERVER,
  'client': TokenType.CLIENT,
  'shared': TokenType.SHARED,
  'route': TokenType.ROUTE,
  'state': TokenType.STATE,
  'computed': TokenType.COMPUTED,
  'effect': TokenType.EFFECT,
  'component': TokenType.COMPONENT,
  'store': TokenType.STORE,
};

// Token class
export class Token {
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }

  toString() {
    return `Token(${this.type}, ${JSON.stringify(this.value)}, ${this.line}:${this.column})`;
  }
}
