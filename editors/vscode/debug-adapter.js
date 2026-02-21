// Tova Debug Adapter — thin wrapper over Node.js debugging
// Compiles .tova → .js with source maps, then launches Node.js debugger

const vscode = require('vscode');
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

class TovaDebugAdapterFactory {
  createDebugAdapterDescriptor(session) {
    // Compile the .tova file first, then use Node's built-in debug
    const program = session.configuration.program;
    if (!program) return undefined;

    const resolvedPath = program.replace('${file}', vscode.window.activeTextEditor?.document.uri.fsPath || '');

    // Compile to temp JS with source maps
    const outDir = path.join(path.dirname(resolvedPath), '.tova-debug');
    const outFile = path.join(outDir, path.basename(resolvedPath).replace('.tova', '.js'));

    try {
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      // Use tova CLI to compile
      execFileSync('bun', ['run', path.join(__dirname, '..', '..', 'bin', 'tova.js'), 'build', resolvedPath, '--output', outDir], {
        cwd: path.dirname(resolvedPath),
        stdio: 'pipe',
      });
    } catch (e) {
      vscode.window.showErrorMessage('Tova compilation failed: ' + (e.message || ''));
      return undefined;
    }

    // Delegate to Node.js debug adapter with the compiled JS file
    return new vscode.DebugAdapterInlineImplementation({
      type: 'node',
      request: 'launch',
      program: outFile,
      sourceMaps: true,
      outFiles: [path.join(outDir, '**/*.js')],
    });
  }
}

function registerDebugAdapter(context) {
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('tova', new TovaDebugAdapterFactory())
  );
}

module.exports = { registerDebugAdapter };
