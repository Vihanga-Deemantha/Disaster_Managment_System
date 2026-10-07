// Fails when package-lock.json does not record every platform build a package asks for.
//
// Rollup, esbuild, Tailwind's engine and a few others ship one native build per operating system, as
// optional dependencies. If a lockfile is created next to an existing node_modules folder, npm can record
// only that machine's build (npm bug #4828). `npm ci` on GitHub's Linux runner then installs nothing for
// Linux and the tests stop with "Cannot find module '@rollup/rollup-linux-x64-gnu'". A friend on a Mac
// would hit the same wall. This check says so early, and says what to do.
//
// Usage: node scripts/check-lockfile.mjs [path/to/package-lock.json]
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? new URL('../package-lock.json', import.meta.url);
const packages = JSON.parse(readFileSync(file, 'utf8')).packages ?? {};

const nameOf = (key) => key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
const recorded = new Set(
  Object.keys(packages)
    .filter(Boolean)
    .map((key) => nameOf(key)),
);

/** Parent package -> the optional dependencies it lists that the lockfile has no entry for. */
function findGaps() {
  const gaps = new Map();
  for (const [key, entry] of Object.entries(packages)) {
    const missing = Object.keys(entry.optionalDependencies ?? {}).filter((n) => !recorded.has(n));
    if (missing.length > 0) gaps.set(key === '' ? '(this project)' : nameOf(key), missing);
  }
  return gaps;
}

function describe([parent, missing]) {
  const examples = missing.slice(0, 3).join(', ');
  const more = missing.length > 3 ? ', ...' : '';
  return `  ${parent}: ${missing.length} missing (${examples}${more})`;
}

const gaps = findGaps();
if (gaps.size === 0) {
  process.stdout.write('package-lock.json records the native builds for every platform.\n');
} else {
  process.stderr.write(
    [
      'package-lock.json is missing native builds for other operating systems:',
      ...[...gaps].map(describe),
      '',
      '`npm ci` on Linux (GitHub Actions) or on a Mac would install none of them, and the tests would stop',
      'with errors such as "Cannot find module \'@rollup/rollup-linux-x64-gnu\'".',
      'Do not add them as dependencies. See "Troubleshooting" in the README for how to repair the lockfile.',
      '',
    ].join('\n'),
  );
  process.exitCode = 1;
}
