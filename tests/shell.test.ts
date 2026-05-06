import assert from 'node:assert/strict'
import { afterEach } from 'node:test'
import test from 'node:test'

import {
  getAllowedCommandPrefixes,
  isRunCommandAllowlistEnabled,
  runShellCommand
} from '../src/integrations/shell'

const originalAllowlistEnabled = process.env.RUN_COMMAND_ALLOWLIST_ENABLED
const originalAllowlist = process.env.RUN_COMMAND_ALLOWLIST

afterEach(() => {
  if (originalAllowlistEnabled === undefined) {
    delete process.env.RUN_COMMAND_ALLOWLIST_ENABLED
  } else {
    process.env.RUN_COMMAND_ALLOWLIST_ENABLED = originalAllowlistEnabled
  }

  if (originalAllowlist === undefined) {
    delete process.env.RUN_COMMAND_ALLOWLIST
  } else {
    process.env.RUN_COMMAND_ALLOWLIST = originalAllowlist
  }
})

test('run command allowlist is disabled by default', () => {
  delete process.env.RUN_COMMAND_ALLOWLIST_ENABLED

  assert.equal(isRunCommandAllowlistEnabled(), false)
})

test('run command allows plain commands by default', async () => {
  delete process.env.RUN_COMMAND_ALLOWLIST_ENABLED
  process.env.RUN_COMMAND_ALLOWLIST = 'git status'

  const result = await runShellCommand({
    command: 'pwd',
    cwd: process.cwd()
  })

  assert.equal(result.exitCode, 0)
  assert.match(result.output, /vibe-in-motion/)
})

test('run command enforces allowlist when enabled', async () => {
  process.env.RUN_COMMAND_ALLOWLIST_ENABLED = 'true'
  process.env.RUN_COMMAND_ALLOWLIST = 'git status'

  await assert.rejects(
    runShellCommand({
      command: 'pwd',
      cwd: process.cwd()
    }),
    /Command is not allowed\. Allowed prefixes: git status/
  )
})

test('run command parses enabled flag truthy values', () => {
  process.env.RUN_COMMAND_ALLOWLIST_ENABLED = 'yes'

  assert.equal(isRunCommandAllowlistEnabled(), true)
})

test('allowed command prefixes are empty when unset', () => {
  delete process.env.RUN_COMMAND_ALLOWLIST

  assert.deepEqual(getAllowedCommandPrefixes(), [])
})
