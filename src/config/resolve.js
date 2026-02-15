// Config resolution: reads tova.toml → falls back to package.json → defaults.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseTOML } from './toml.js';

const DEFAULTS = {
  project: {
    name: 'tova-app',
    version: '0.1.0',
    description: '',
    entry: 'src',
  },
  build: {
    output: '.tova-out',
  },
  dev: {
    port: 3000,
  },
  dependencies: {},
  npm: {},
};

export function resolveConfig(cwd) {
  const tomlPath = join(cwd, 'tova.toml');
  const pkgPath = join(cwd, 'package.json');

  // Try tova.toml first
  if (existsSync(tomlPath)) {
    const raw = readFileSync(tomlPath, 'utf-8');
    const parsed = parseTOML(raw);
    return normalizeConfig(parsed, 'tova.toml');
  }

  // Fall back to package.json
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return configFromPackageJson(pkg);
  }

  // Return defaults
  return { ...DEFAULTS, _source: 'defaults' };
}

function normalizeConfig(parsed, source) {
  const config = {
    project: {
      name: parsed.project?.name || DEFAULTS.project.name,
      version: parsed.project?.version || DEFAULTS.project.version,
      description: parsed.project?.description || DEFAULTS.project.description,
      entry: parsed.project?.entry || DEFAULTS.project.entry,
    },
    build: {
      output: parsed.build?.output || DEFAULTS.build.output,
    },
    dev: {
      port: parsed.dev?.port ?? DEFAULTS.dev.port,
    },
    dependencies: parsed.dependencies || {},
    npm: {},
    _source: source,
  };

  // Collect npm deps: top-level from [npm], dev deps from [npm.dev]
  if (parsed.npm) {
    for (const [key, value] of Object.entries(parsed.npm)) {
      if (key === 'dev' && typeof value === 'object' && !Array.isArray(value)) {
        config.npm.dev = value;
      } else if (typeof value === 'string') {
        if (!config.npm.prod) config.npm.prod = {};
        config.npm.prod[key] = value;
      }
    }
  }

  return config;
}

function configFromPackageJson(pkg) {
  return {
    project: {
      name: pkg.name || DEFAULTS.project.name,
      version: pkg.version || DEFAULTS.project.version,
      description: pkg.description || DEFAULTS.project.description,
      entry: DEFAULTS.project.entry,
    },
    build: {
      output: DEFAULTS.build.output,
    },
    dev: {
      port: DEFAULTS.dev.port,
    },
    dependencies: {},
    npm: {
      prod: pkg.dependencies || {},
      dev: pkg.devDependencies || {},
    },
    _source: 'package.json',
  };
}
