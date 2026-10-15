// Run in order: the final import suite consumes native documents made by these UI scenarios.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const name of ['dependencies', '2d', 'ui', 'extras', '3d', 'roundtrip']) {
  const script = path.join(__dirname, `audit-copy-${name}.cjs`);
  const result = spawnSync(process.execPath, [script, '--verify'], {
    cwd: path.resolve(__dirname, '../..'), stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
