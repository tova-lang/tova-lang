export function installConcurrencyParser(ParserClass) {
  if (ParserClass.prototype._concurrencyParserInstalled) return;
  ParserClass.prototype._concurrencyParserInstalled = true;

  // Stub — implemented in Task 3
  ParserClass.prototype.parseConcurrentBlock = function() {
    this.error('concurrent blocks not yet implemented');
  };
}
