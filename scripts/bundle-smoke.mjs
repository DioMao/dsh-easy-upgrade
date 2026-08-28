import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const clientFile = new URL('../lib/client.js', import.meta.url)
const hostFile = new URL('../lib/index.js', import.meta.url)

assert.ok(existsSync(clientFile), 'lib/client.js is missing; run pnpm build first')
assert.ok(existsSync(hostFile), 'lib/index.js is missing; run pnpm build first')

let handoff = null
globalThis.window = { __ModuleLoader__: { load(value) { handoff = value } } }
new Function(readFileSync(clientFile, 'utf8'))()

assert.ok(handoff !== null, 'client bundle must register through __ModuleLoader__.load')
assert.equal(handoff.id, 'dsh-easy-upgrade')
assert.equal(typeof handoff.factory, 'function')

const host = await import(hostFile.href)
assert.equal(host.name, 'dsh-easy-upgrade')
assert.equal(typeof host.apply, 'function')

delete globalThis.window
console.log('bundle smoke passed: host export and client module-loader handoff')
