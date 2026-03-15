import { color } from './utils.js';

export function completionsCommand(shell) {
  if (!shell) {
    console.error('Usage: tova completions <bash|zsh|fish>');
    process.exit(1);
  }

  const commands = [
    'run', 'build', 'check', 'clean', 'dev', 'new', 'install', 'add', 'remove',
    'repl', 'lsp', 'fmt', 'test', 'bench', 'doc', 'init', 'upgrade', 'info',
    'explain', 'doctor', 'completions',
    'migrate:create', 'migrate:up', 'migrate:down', 'migrate:reset', 'migrate:fresh', 'migrate:status',
  ];

  const globalFlags = ['--help', '--version', '--output', '--production', '--watch', '--verbose', '--quiet', '--debug', '--strict', '--strict-security'];

  switch (shell) {
    case 'bash': {
      const script = `# tova bash completions
# Add to ~/.bashrc: eval "$(tova completions bash)"
_tova() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${commands.join(' ')}"

  case "\${prev}" in
    tova)
      COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
      return 0
      ;;
    new)
      COMPREPLY=( $(compgen -W "--template" -- "\${cur}") )
      return 0
      ;;
    --template)
      COMPREPLY=( $(compgen -W "fullstack spa site api script library blank" -- "\${cur}") )
      return 0
      ;;
    completions)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
    run|build|check|fmt|doc)
      COMPREPLY=( $(compgen -f -X '!*.tova' -- "\${cur}") $(compgen -d -- "\${cur}") )
      return 0
      ;;
  esac

  if [[ "\${cur}" == -* ]]; then
    COMPREPLY=( $(compgen -W "${globalFlags.join(' ')} --filter --coverage --serial --check --template --dev --binary --no-cache" -- "\${cur}") )
    return 0
  fi
}
complete -F _tova tova
`;
      console.log(script);
      console.error(`${color.dim('# Add to your ~/.bashrc:')}`);
      console.error(`${color.dim('#   eval "$(tova completions bash)"')}`);
      break;
    }
    case 'zsh': {
      const script = `#compdef tova
# tova zsh completions
# Add to ~/.zshrc: eval "$(tova completions zsh)"

_tova() {
  local -a commands
  commands=(
${commands.map(c => `    '${c}:${c} command'`).join('\n')}
  )

  _arguments -C \\
    '1:command:->cmd' \\
    '*::arg:->args'

  case $state in
    cmd)
      _describe -t commands 'tova command' commands
      ;;
    args)
      case $words[1] in
        new)
          _arguments \\
            '--template[Project template]:template:(fullstack spa site api script library blank)' \\
            '*:name:'
          ;;
        run|build|check|fmt|doc)
          _files -g '*.tova'
          ;;
        test|bench)
          _arguments \\
            '--filter[Filter pattern]:pattern:' \\
            '--watch[Watch mode]' \\
            '--coverage[Enable coverage]' \\
            '--serial[Sequential execution]'
          ;;
        completions)
          _values 'shell' bash zsh fish
          ;;
        explain)
          _message 'error code (e.g., E202)'
          ;;
        *)
          _arguments \\
            '--help[Show help]' \\
            '--version[Show version]' \\
            '--output[Output directory]:dir:_dirs' \\
            '--production[Production build]' \\
            '--watch[Watch mode]' \\
            '--verbose[Verbose output]' \\
            '--quiet[Quiet mode]' \\
            '--debug[Debug output]' \\
            '--strict[Strict type checking]'
          ;;
      esac
      ;;
  esac
}

_tova "$@"
`;
      console.log(script);
      console.error(`${color.dim('# Add to your ~/.zshrc:')}`);
      console.error(`${color.dim('#   eval "$(tova completions zsh)"')}`);
      break;
    }
    case 'fish': {
      const descriptions = {
        run: 'Compile and execute a .tova file',
        build: 'Compile .tova files to JavaScript',
        check: 'Type-check without generating code',
        clean: 'Delete build artifacts',
        dev: 'Start development server',
        new: 'Create a new Tova project',
        install: 'Install npm dependencies',
        add: 'Add an npm dependency',
        remove: 'Remove an npm dependency',
        repl: 'Start interactive REPL',
        lsp: 'Start Language Server Protocol server',
        fmt: 'Format .tova files',
        test: 'Run test blocks',
        bench: 'Run bench blocks',
        doc: 'Generate documentation',
        init: 'Initialize project in current directory',
        upgrade: 'Upgrade Tova to latest version',
        info: 'Show version and project info',
        explain: 'Explain an error code',
        doctor: 'Check development environment',
        completions: 'Generate shell completions',
        'migrate:create': 'Create a migration file',
        'migrate:up': 'Run pending migrations',
        'migrate:down': 'Roll back last migration',
        'migrate:reset': 'Roll back all migrations',
        'migrate:fresh': 'Drop tables and re-migrate',
        'migrate:status': 'Show migration status',
      };

      let script = `# tova fish completions
# Save to: tova completions fish > ~/.config/fish/completions/tova.fish

`;
      for (const [cmd, desc] of Object.entries(descriptions)) {
        script += `complete -c tova -n '__fish_use_subcommand' -a '${cmd}' -d '${desc}'\n`;
      }
      script += `\n# Flags\n`;
      script += `complete -c tova -l help -s h -d 'Show help'\n`;
      script += `complete -c tova -l version -s v -d 'Show version'\n`;
      script += `complete -c tova -l output -s o -d 'Output directory'\n`;
      script += `complete -c tova -l production -d 'Production build'\n`;
      script += `complete -c tova -l watch -d 'Watch mode'\n`;
      script += `complete -c tova -l verbose -d 'Verbose output'\n`;
      script += `complete -c tova -l quiet -d 'Quiet mode'\n`;
      script += `complete -c tova -l debug -d 'Debug output'\n`;
      script += `complete -c tova -l strict -d 'Strict type checking'\n`;
      script += `\n# Template completions for 'new'\n`;
      script += `complete -c tova -n '__fish_seen_subcommand_from new' -l template -d 'Project template' -xa 'fullstack spa site api script library blank'\n`;
      script += `\n# Shell completions for 'completions'\n`;
      script += `complete -c tova -n '__fish_seen_subcommand_from completions' -xa 'bash zsh fish'\n`;

      console.log(script);
      console.error(`${color.dim('# Save to:')}`);
      console.error(`${color.dim('#   tova completions fish > ~/.config/fish/completions/tova.fish')}`);
      break;
    }
    default:
      console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
      process.exit(1);
  }
}
