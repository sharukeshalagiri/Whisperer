import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specification = path.join(root, 'apps', 'api', 'openapi.json');
const packageRoot = path.join(root, 'packages', 'api-client');
const source = path.join(packageRoot, 'src');
const output = path.join(packageRoot, 'dist');
const generator = path.join(root, 'node_modules', '@hey-api', 'openapi-ts', 'bin', 'run.js');
const compiler = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

/**
 * Run a local executable with repository-root working directory.
 * Args: executable is a Node script path; arguments are command-line arguments.
 * Returns: none after the executable succeeds.
 * Raises: Error when the child process exits unsuccessfully.
 */
function run(executable, arguments_) {
  execFileSync(process.execPath, [executable, ...arguments_], { cwd: root, stdio: 'inherit' });
}

/**
 * Regenerate the committed CommonJS API client from the FastAPI OpenAPI contract.
 * Args: none.
 * Returns: none after TypeScript generation and compilation succeed.
 * Raises: Error when the committed API contract or local generator dependencies are absent.
 */
function generate() {
  if (!fs.existsSync(specification)) throw new Error(`Missing generated FastAPI contract: ${specification}`);
  if (!fs.existsSync(generator) || !fs.existsSync(compiler)) throw new Error('Run npm ci before generating the API client');
  const documentation = new Map();
  for (const directory of [source, output]) {
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { recursive: true })) {
      if (['README.md', 'AGENTS.md', 'CLAUDE.md'].includes(path.basename(entry))) {
        const file = path.join(directory, entry);
        documentation.set(file, fs.readFileSync(file, 'utf8'));
      }
    }
  }
  try {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
    fs.mkdirSync(packageRoot, { recursive: true });
    run(generator, ['--input', specification, '--output', source, '--no-log-file']);
    run(compiler, ['--project', path.join(packageRoot, 'tsconfig.json')]);
  } finally {
    // Directory guides are authored documentation, not disposable generator output.
    for (const [file, content] of documentation) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
}

generate();
