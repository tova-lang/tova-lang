// Generate a shadow package.json from tova.toml config.

import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MARKER = '// Auto-generated from tova.toml. Do not edit.';

export function generatePackageJson(config, cwd) {
  const npmProd = config.npm?.prod || {};
  const npmDev = config.npm?.dev || {};

  const hasNpmDeps = Object.keys(npmProd).length > 0 || Object.keys(npmDev).length > 0;
  if (!hasNpmDeps) return null;

  const pkg = {
    '//': MARKER,
    name: config.project.name,
    version: config.project.version,
    private: true,
    type: 'module',
  };

  if (Object.keys(npmProd).length > 0) {
    pkg.dependencies = npmProd;
  }

  if (Object.keys(npmDev).length > 0) {
    pkg.devDependencies = npmDev;
  }

  return pkg;
}

export function writePackageJson(config, cwd) {
  const pkg = generatePackageJson(config, cwd);
  if (!pkg) return false;

  const pkgPath = join(cwd, 'package.json');
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return true;
}

export function isGeneratedPackageJson(cwd) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg['//'] === MARKER;
  } catch {
    return false;
  }
}
