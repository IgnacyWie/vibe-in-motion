import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildProcessEnv, truncateText } from '../src/integrations/process'

test('buildProcessEnv appends common executable paths', () => {
  const env = buildProcessEnv({
    HOME: '/Users/tester',
    PATH: '/usr/bin:/bin'
  })

  const pathEntries = String(env.PATH).split(path.delimiter)

  assert.equal(env.PNPM_HOME, '/Users/tester/Library/pnpm')
  assert.ok(pathEntries.includes('/Users/tester/Library/pnpm'))
  assert.ok(pathEntries.includes('/opt/homebrew/bin'))
  assert.ok(pathEntries.includes('/usr/local/bin'))
  assert.ok(pathEntries.includes('/usr/bin'))
  assert.ok(pathEntries.includes('/bin'))
})

test('buildProcessEnv respects existing PNPM_HOME', () => {
  const env = buildProcessEnv({
    HOME: '/Users/tester',
    PNPM_HOME: '/custom/pnpm',
    PATH: '/usr/bin'
  })

  const pathEntries = String(env.PATH).split(path.delimiter)

  assert.equal(env.PNPM_HOME, '/custom/pnpm')
  assert.ok(pathEntries.includes('/custom/pnpm'))
})

test('buildProcessEnv works without PATH set', () => {
  const homeDir = os.homedir()
  const env = buildProcessEnv({})
  const pathEntries = String(env.PATH).split(path.delimiter)

  assert.ok(pathEntries.includes(path.join(homeDir, 'Library', 'pnpm')))
  assert.ok(pathEntries.includes('/usr/bin'))
})

test('truncateText keeps the bottom of long output', () => {
  const value = [
    'build step 1',
    'build step 2',
    'build step 3',
    'Error: deploy failed at final step'
  ].join('\n')

  const truncated = truncateText(value, 55)

  assert.match(truncated, /^\[output truncated\]\n/)
  assert.match(truncated, /Error: deploy failed at final step$/)
  assert.doesNotMatch(truncated, /build step 1/)
})
