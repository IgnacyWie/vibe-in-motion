import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { getCodeProvider } from '../src/integrations/code-provider'
import { runClaudeCodeTask } from '../src/integrations/claude-code'
import { runCodexTask } from '../src/integrations/codex'

test('code provider defaults to codex', () => {
  const originalProvider = process.env.CODE_PROVIDER
  delete process.env.CODE_PROVIDER

  try {
    assert.equal(getCodeProvider(), 'codex')
  } finally {
    restoreEnv('CODE_PROVIDER', originalProvider)
  }
})

test('code provider accepts Claude aliases', () => {
  const originalProvider = process.env.CODE_PROVIDER

  try {
    for (const provider of ['claude', 'claude-code', 'claude_code']) {
      process.env.CODE_PROVIDER = provider
      assert.equal(getCodeProvider(), 'claude')
    }
  } finally {
    restoreEnv('CODE_PROVIDER', originalProvider)
  }
})

test('Claude Code runner invokes the configured command in the workspace', async () => {
  const originalCommand = process.env.CLAUDE_CODE_COMMAND
  const originalPermissionMode = process.env.CLAUDE_CODE_PERMISSION_MODE
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-claude-code-'))
  const workspacePath = path.join(tempDir, 'workspace')
  const commandPath = path.join(tempDir, 'claude')

  fs.mkdirSync(workspacePath)
  fs.writeFileSync(
    commandPath,
    [
      '#!/bin/sh',
      'printf "cwd=%s\\n" "$PWD"',
      'printf "args=%s\\n" "$*"'
    ].join('\n')
  )
  fs.chmodSync(commandPath, 0o755)

  process.env.CLAUDE_CODE_COMMAND = commandPath
  process.env.CLAUDE_CODE_PERMISSION_MODE = 'acceptEdits'

  try {
    const result = await runClaudeCodeTask({
      prompt: 'add provider support',
      workspacePath
    })

    assert.equal(result.ok, true)
    assert.equal(result.providerName, 'Claude Code')
    assert.match(result.message, new RegExp(`cwd=${fs.realpathSync(workspacePath)}`))
    assert.match(result.message, /args=-p add provider support --output-format text --permission-mode acceptEdits/)
  } finally {
    restoreEnv('CLAUDE_CODE_COMMAND', originalCommand)
    restoreEnv('CLAUDE_CODE_PERMISSION_MODE', originalPermissionMode)
  }
})

test('Codex runner attaches image paths with --image', async () => {
  const originalPath = process.env.PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-codex-'))
  const binPath = path.join(tempDir, 'bin')
  const workspacePath = path.join(tempDir, 'workspace')
  const commandPath = path.join(binPath, 'codex')
  const imagePath = path.join(tempDir, 'photo.jpg')

  fs.mkdirSync(binPath)
  fs.mkdirSync(workspacePath)
  fs.writeFileSync(imagePath, 'image')
  fs.writeFileSync(
    commandPath,
    [
      '#!/bin/sh',
      'output_file=""',
      'previous_arg=""',
      'for arg in "$@"; do',
      '  if [ "$previous_arg" = "-o" ]; then',
      '    output_file="$arg"',
      '  fi',
      '  previous_arg="$arg"',
      'done',
      'printf "%s\\n" "$@" > "$output_file"'
    ].join('\n')
  )
  fs.chmodSync(commandPath, 0o755)
  process.env.PATH = `${binPath}${path.delimiter}${originalPath || ''}`

  try {
    const result = await runCodexTask({
      imagePaths: [imagePath],
      prompt: 'match this screenshot',
      workspacePath
    })

    assert.equal(result.ok, true)
    assert.match(result.message, /--image/)
    assert.match(result.message, new RegExp(escapeRegExp(imagePath)))
    assert.match(result.message, /match this screenshot/)
  } finally {
    restoreEnv('PATH', originalPath)
  }
})

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
