import fs from 'node:fs';
import path from 'node:path';

/**
 * Select the development server's Python without importing its ML libraries.
 * Keep virtual-environment symlinks intact: resolving them to the base Python
 * binary would discard the environment's installed packages.
 */
export function resolveDevelopmentPython({
  projectRoot = process.cwd(),
  env = process.env,
  platform = process.platform,
  isExecutable,
} = {}) {
  const windows = platform === 'win32';
  const paths = windows ? path.win32 : path.posix;
  const root = paths.resolve(projectRoot);
  const canExecute = isExecutable || (candidate => {
    try {
      if (!fs.statSync(candidate).isFile()) return false;
      // Windows does not implement Unix executable permission bits.
      fs.accessSync(candidate, windows ? fs.constants.F_OK : fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  const executableAt = candidate => {
    const absolute = paths.resolve(root, candidate);
    return canExecute(absolute) ? absolute : null;
  };

  const configured = env.BONZAI_PYTHON_PATH?.trim();
  if (configured) {
    const cmd = executableAt(configured);
    if (!cmd) {
      throw new Error(
        `BONZAI_PYTHON_PATH is not an executable Python file: ${configured}. `
        + 'Set it to the Python executable in your BonzAI virtual environment, or unset it to use automatic detection.',
      );
    }
    return { cmd, source: 'configured' };
  }

  const environments = [
    [env.VIRTUAL_ENV?.trim(), 'virtual-env'],
    [paths.join(root, '.venv'), 'project-venv'],
    [paths.join(root, 'bonzai'), 'legacy-venv'],
  ];
  const relativeExecutables = windows
    ? [paths.join('Scripts', 'python.exe')]
    : [paths.join('bin', 'python3'), paths.join('bin', 'python')];
  for (const [directory, source] of environments) {
    if (!directory) continue;
    for (const relative of relativeExecutables) {
      const cmd = executableAt(paths.join(directory, relative));
      if (cmd) return { cmd, source };
    }
  }

  // Windows environment keys are case-insensitive (commonly "Path").
  const pathKey = windows
    ? Object.keys(env).find(key => key.toLowerCase() === 'path')
    : 'PATH';
  const searchPath = pathKey ? env[pathKey] : '';
  const names = windows ? ['python.exe', 'python3.exe'] : ['python3', 'python'];
  // Prefer the normal platform command across PATH before its alternative.
  for (const name of names) {
    for (const directory of (searchPath || '').split(windows ? ';' : ':').filter(Boolean)) {
      const unquoted = directory.replace(/^"(.*)"$/, '$1');
      const cmd = executableAt(paths.join(unquoted, name));
      if (cmd) return { cmd, source: 'path' };
    }
  }

  throw new Error(
    'No Python executable was found for the BonzAI media server. '
    + 'Create a project .venv and run its Python with scripts/install-python-deps.py, '
    + 'or set BONZAI_PYTHON_PATH to an existing BonzAI environment executable.',
  );
}
