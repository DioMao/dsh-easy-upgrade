import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const [{ files }] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }))
const paths = new Set(files.map(file => file.path))
for (const path of ['LICENSE', 'README.md', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'lib/invariant.js', 'package.json']) {
  assert.ok(paths.has(path), `package is missing ${path}`)
}
for (const path of paths) assert.ok(!path.startsWith('src/'), `package must not publish source file ${path}`)
console.log(`package smoke passed: ${paths.size} files`)
