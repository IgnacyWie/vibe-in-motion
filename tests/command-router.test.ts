import assert from 'node:assert/strict'
import test from 'node:test'

import { createCommandRouter } from '../src/command-router'
import { openDatabase } from '../src/storage/database'
import { createWorkspaceStore } from '../src/storage/workspace-store'

test('repo commands persist workspaces and allow selecting them', async () => {
  process.env.DEVELOPER_ROOT = '/Users/ignacywielogorski/Developer'
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  const router = createCommandRouter({ workspaceStore })

  const saveReply = await router.handleCommand({
    chatId: 12345,
    text: '/repo add vibe vibe-in-motion'
  })

  assert.match(saveReply, /Workspace saved\./)

  const listReply = await router.handleCommand({
    chatId: 12345,
    text: '/repo list'
  })

  assert.match(listReply, /\* vibe: /)

  const currentReply = await router.handleCommand({
    chatId: 12345,
    text: '/repo current'
  })

  assert.match(currentReply, /Current workspace: vibe/)
})

test('codex command uses the active workspace', async () => {
  process.env.DEVELOPER_ROOT = '/Users/ignacywielogorski/Developer'
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  workspaceStore.upsertWorkspace('vibe', 'vibe-in-motion')
  workspaceStore.setActiveWorkspace(12345, 'vibe')

  const router = createCommandRouter({
    workspaceStore,
    codexRunner: async ({ prompt, workspacePath }) => ({
      ok: true,
      exitCode: 0,
      message: `Prompt: ${prompt}\nPath: ${workspacePath}`,
      output: ''
    })
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/codex add a help command'
  })

  assert.match(reply, /Workspace: vibe/)
  assert.match(reply, /Prompt: add a help command/)
})

test('run command uses the active workspace cwd', async () => {
  process.env.DEVELOPER_ROOT = '/Users/ignacywielogorski/Developer'
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  workspaceStore.upsertWorkspace('vibe', 'vibe-in-motion')
  workspaceStore.setActiveWorkspace(12345, 'vibe')

  const router = createCommandRouter({
    workspaceStore,
    shellRunner: async ({ command, cwd }) => ({
      ok: true,
      exitCode: 0,
      output: `Command: ${command}\nCwd: ${cwd}`
    })
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/run git status'
  })

  assert.match(reply, /Working directory: \/Users\/ignacywielogorski\/Developer\/vibe-in-motion/)
  assert.match(reply, /Command: git status/)
})

test('run command requires an active workspace', async () => {
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  const router = createCommandRouter({ workspaceStore })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/run git status'
  })

  assert.match(reply, /No active workspace/)
})
