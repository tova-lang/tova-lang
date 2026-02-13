const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');
const path = require('path');

let client;

function activate(context) {
  // Find the lux binary or server script
  const serverModule = path.join(__dirname, '..', '..', 'src', 'lsp', 'server.js');

  const serverOptions = {
    run: {
      command: 'bun',
      args: ['run', serverModule],
      transport: TransportKind.stdio,
    },
    debug: {
      command: 'bun',
      args: ['run', serverModule],
      transport: TransportKind.stdio,
    },
  };

  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'lux' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.lux'),
    },
  };

  client = new LanguageClient('lux-lsp', 'Lux Language Server', serverOptions, clientOptions);
  client.start();
}

function deactivate() {
  if (client) {
    return client.stop();
  }
}

module.exports = { activate, deactivate };
