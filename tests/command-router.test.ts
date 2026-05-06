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

test('short codex alias uses the active workspace', async () => {
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
    text: '/c add an alias test'
  })

  assert.match(reply, /Workspace: vibe/)
  assert.match(reply, /Prompt: add an alias test/)
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

test('codex-ship starts a deployment watcher after a successful push', async () => {
  process.env.DEVELOPER_ROOT = '/Users/ignacywielogorski/Developer'
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  workspaceStore.upsertWorkspace('vibe', 'vibe-in-motion')
  workspaceStore.setActiveWorkspace(12345, 'vibe')

  const notifications: string[] = []
  const watcherCalls: Array<{ branch: string; commitSha: string; workspacePath: string }> = []
  const router = createCommandRouter({
    workspaceStore,
    codexRunner: async () => ({
      ok: true,
      exitCode: 0,
      message: 'Codex done.',
      output: ''
    }),
    gitShipRunner: async () => ({
      ok: true,
      exitCode: 0,
      branch: 'main',
      commitSha: 'abc123',
      message: 'Pushed.'
    }),
    deploymentWatcher: async input => {
      watcherCalls.push(input)
      return {
        commitSha: input.commitSha,
        conclusion: 'success',
        name: 'deploy',
        url: 'https://github.com/example/repo/actions/runs/1'
      }
    },
    notifyChat: async (_chatId, message) => {
      notifications.push(message)
    }
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/codex-ship add deployment notifications'
  })

  await new Promise(resolve => setImmediate(resolve))

  assert.match(reply, /Watching GitHub Actions for commit abc123\./)
  assert.equal(watcherCalls.length, 1)
  assert.equal(watcherCalls[0].branch, 'main')
  assert.equal(notifications.length, 1)
  assert.match(notifications[0], /Deployment finished for vibe\./)
  assert.match(notifications[0], /Conclusion: success/)
})

test('short codex-ship alias starts a deployment watcher after a successful push', async () => {
  process.env.DEVELOPER_ROOT = '/Users/ignacywielogorski/Developer'
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  workspaceStore.upsertWorkspace('vibe', 'vibe-in-motion')
  workspaceStore.setActiveWorkspace(12345, 'vibe')

  const notifications: string[] = []
  const watcherCalls: Array<{ branch: string; commitSha: string; workspacePath: string }> = []
  const router = createCommandRouter({
    workspaceStore,
    codexRunner: async () => ({
      ok: true,
      exitCode: 0,
      message: 'Codex done.',
      output: ''
    }),
    gitShipRunner: async () => ({
      ok: true,
      exitCode: 0,
      branch: 'main',
      commitSha: 'def456',
      message: 'Pushed.'
    }),
    deploymentWatcher: async input => {
      watcherCalls.push(input)
      return {
        commitSha: input.commitSha,
        conclusion: 'success',
        name: 'deploy',
        url: 'https://github.com/example/repo/actions/runs/2'
      }
    },
    notifyChat: async (_chatId, message) => {
      notifications.push(message)
    }
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/cs ship via alias'
  })

  await new Promise(resolve => setImmediate(resolve))

  assert.match(reply, /Watching GitHub Actions for commit def456\./)
  assert.equal(watcherCalls.length, 1)
  assert.equal(notifications.length, 1)
})

test('short run alias uses the active workspace cwd', async () => {
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
    text: '/r git status'
  })

  assert.match(reply, /Working directory: \/Users\/ignacywielogorski\/Developer\/vibe-in-motion/)
  assert.match(reply, /Command: git status/)
})
