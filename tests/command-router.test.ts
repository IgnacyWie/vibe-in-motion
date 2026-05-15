import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createCommandRouter, TELEGRAM_BOT_COMMANDS } from '../src/command-router'
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

test('repo pull clones a GitHub slug over ssh and selects the workspace', async () => {
  const developerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-developer-'))
  process.env.DEVELOPER_ROOT = developerRoot
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  const cloneCalls: Array<{ destinationPath: string; repoSlug: string }> = []
  const notifications: string[] = []
  const router = createCommandRouter({
    workspaceStore,
    notifyChat: async (_chatId, message) => {
      notifications.push(message)
    },
    gitCloneRunner: async input => {
      cloneCalls.push(input)
      fs.mkdirSync(input.destinationPath, { recursive: true })

      return {
        ok: true,
        exitCode: 0,
        message: 'Cloned.',
        remoteUrl: `git@github.com:${input.repoSlug}.git`
      }
    }
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/repo pull IgnacyWie/vibe-in-motion'
  })

  assert.equal(cloneCalls.length, 1)
  assert.equal(cloneCalls[0].repoSlug, 'IgnacyWie/vibe-in-motion')
  assert.equal(cloneCalls[0].destinationPath, path.join(developerRoot, 'vibe-in-motion'))
  assert.match(reply, /Repository pulled and workspace saved\./)
  assert.match(reply, /Alias: vibe-in-motion/)
  assert.match(reply, /Remote: git@github\.com:IgnacyWie\/vibe-in-motion\.git/)
  assert.equal(notifications.length, 1)
  assert.equal(
    notifications[0],
    'Chat ID: 12345\nActive workspace: vibe-in-motion\nCode provider: codex'
  )

  const activeWorkspace = workspaceStore.getActiveWorkspace(12345)
  assert.equal(activeWorkspace?.alias, 'vibe-in-motion')
  assert.equal(activeWorkspace?.path, path.join(developerRoot, 'vibe-in-motion'))
})

test('repo pull sends a failure status message when cloning fails', async () => {
  const developerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-developer-'))
  process.env.DEVELOPER_ROOT = developerRoot
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  const notifications: string[] = []
  const router = createCommandRouter({
    workspaceStore,
    notifyChat: async (_chatId, message) => {
      notifications.push(message)
    },
    gitCloneRunner: async input => ({
      ok: false,
      exitCode: 128,
      message: `fatal: repository '${input.repoSlug}' not found`,
      remoteUrl: `git@github.com:${input.repoSlug}.git`
    })
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/repo pull IgnacyWie/missing-repo'
  })

  assert.match(reply, /Clone failed for git@github\.com:IgnacyWie\/missing-repo\.git/)
  assert.match(reply, /Exit code: 128/)
  assert.equal(notifications.length, 1)
  assert.match(notifications[0], /Clone failed for git@github\.com:IgnacyWie\/missing-repo\.git/)
  assert.match(notifications[0], /fatal: repository 'IgnacyWie\/missing-repo' not found/)
})

test('repo pull supports a custom workspace alias', async () => {
  const developerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-developer-'))
  process.env.DEVELOPER_ROOT = developerRoot
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  const router = createCommandRouter({
    workspaceStore,
    gitCloneRunner: async input => {
      fs.mkdirSync(input.destinationPath, { recursive: true })

      return {
        ok: true,
        exitCode: 0,
        message: 'Cloned.',
        remoteUrl: `git@github.com:${input.repoSlug}.git`
      }
    }
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/repo pull IgnacyWie/vibe-in-motion vibe'
  })

  assert.match(reply, /Alias: vibe/)
  assert.equal(workspaceStore.getActiveWorkspace(12345)?.alias, 'vibe')
})

test('repo pull refuses to overwrite an existing Developer path', async () => {
  const developerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-developer-'))
  fs.mkdirSync(path.join(developerRoot, 'vibe-in-motion'))
  process.env.DEVELOPER_ROOT = developerRoot
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  let cloneCalled = false
  const router = createCommandRouter({
    workspaceStore,
    gitCloneRunner: async input => {
      cloneCalled = true

      return {
        ok: true,
        exitCode: 0,
        message: 'Cloned.',
        remoteUrl: `git@github.com:${input.repoSlug}.git`
      }
    }
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/repo pull IgnacyWie/vibe-in-motion'
  })

  assert.equal(cloneCalled, false)
  assert.match(reply, /Path already exists under Developer: vibe-in-motion/)
})

test('repo pull validates custom alias before cloning', async () => {
  const developerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-developer-'))
  process.env.DEVELOPER_ROOT = developerRoot
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  let cloneCalled = false
  const router = createCommandRouter({
    workspaceStore,
    gitCloneRunner: async input => {
      cloneCalled = true

      return {
        ok: true,
        exitCode: 0,
        message: 'Cloned.',
        remoteUrl: `git@github.com:${input.repoSlug}.git`
      }
    }
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/repo pull IgnacyWie/vibe-in-motion bad.alias'
  })

  assert.equal(cloneCalled, false)
  assert.match(reply, /Workspace alias must use lowercase letters/)
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

test('codex command can report a Claude Code provider result', async () => {
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
      output: '',
      providerName: 'Claude Code'
    })
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/codex use another provider'
  })

  assert.match(reply, /Workspace: vibe/)
  assert.match(reply, /Claude Code exit code: 0/)
  assert.match(reply, /Prompt: use another provider/)
})

test('provider command switches the active code provider for the chat', async () => {
  process.env.DEVELOPER_ROOT = '/Users/ignacywielogorski/Developer'
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  workspaceStore.upsertWorkspace('vibe', 'vibe-in-motion')
  workspaceStore.setActiveWorkspace(12345, 'vibe')
  const calls: Array<{ provider?: string; prompt: string; workspacePath: string }> = []

  const router = createCommandRouter({
    workspaceStore,
    codexRunner: async input => {
      calls.push(input)

      return {
        ok: true,
        exitCode: 0,
        message: `Provider: ${input.provider}`,
        output: '',
        providerName: input.provider === 'claude' ? 'Claude Code' : 'Codex'
      }
    }
  })

  const switchReply = await router.handleCommand({
    chatId: 12345,
    text: '/provider use claude'
  })

  const codexReply = await router.handleCommand({
    chatId: 12345,
    text: '/codex add provider support'
  })

  assert.equal(switchReply, 'Code provider set to claude')
  assert.equal(calls[0].provider, 'claude')
  assert.match(codexReply, /Claude Code exit code: 0/)
  assert.match(codexReply, /Provider: claude/)
})

test('provider command supports codex shorthand and current status', async () => {
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  const router = createCommandRouter({ workspaceStore })

  const switchReply = await router.handleCommand({
    chatId: 12345,
    text: '/provider codex'
  })

  const currentReply = await router.handleCommand({
    chatId: 12345,
    text: '/provider current'
  })

  assert.equal(switchReply, 'Code provider set to codex')
  assert.equal(currentReply, 'Current code provider: codex')
})

test('underscored codex ship alias uses the active workspace', async () => {
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
    }),
    gitShipRunner: async () => ({
      ok: true,
      exitCode: 0,
      branch: 'main',
      commitSha: 'ghi789',
      message: 'Pushed.'
    }),
    deploymentWatcher: async input => ({
      commitSha: input.commitSha,
      conclusion: 'success',
      name: 'deploy',
      url: 'https://github.com/example/repo/actions/runs/3'
    }),
    notifyChat: async () => {}
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/codex_ship ship via suggested command'
  })

  assert.match(reply, /Workspace: vibe/)
  assert.match(reply, /Codex exit code: 0/)
  assert.match(reply, /Git exit code: 0/)
  assert.match(reply, /Watching GitHub Actions for commit ghi789\./)
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

test('rollback command uses the active workspace', async () => {
  process.env.DEVELOPER_ROOT = '/Users/ignacywielogorski/Developer'
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  workspaceStore.upsertWorkspace('vibe', 'vibe-in-motion')
  workspaceStore.setActiveWorkspace(12345, 'vibe')

  const rollbackCalls: Array<{ workspacePath: string }> = []
  const router = createCommandRouter({
    workspaceStore,
    gitRollbackRunner: async input => {
      rollbackCalls.push(input)

      return {
        ok: true,
        exitCode: 0,
        branch: 'main',
        backupBranch: 'rollback/main-abc123-20260515T120000Z',
        rolledBackFrom: 'abc123',
        rolledBackTo: 'def456',
        message: 'Rolled back.'
      }
    }
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/rollback'
  })

  assert.equal(rollbackCalls.length, 1)
  assert.equal(rollbackCalls[0].workspacePath, '/Users/ignacywielogorski/Developer/vibe-in-motion')
  assert.match(reply, /Workspace: vibe/)
  assert.match(reply, /Git exit code: 0/)
  assert.match(reply, /Rolled back\./)
})

test('short rollback alias uses the active workspace', async () => {
  process.env.DEVELOPER_ROOT = '/Users/ignacywielogorski/Developer'
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  workspaceStore.upsertWorkspace('vibe', 'vibe-in-motion')
  workspaceStore.setActiveWorkspace(12345, 'vibe')

  const router = createCommandRouter({
    workspaceStore,
    gitRollbackRunner: async () => ({
      ok: true,
      exitCode: 0,
      message: 'Rolled back through alias.'
    })
  })

  const reply = await router.handleCommand({
    chatId: 12345,
    text: '/rb'
  })

  assert.match(reply, /Workspace: vibe/)
  assert.match(reply, /Rolled back through alias\./)
})

test('repo command aliases map to repo subcommands', async () => {
  process.env.DEVELOPER_ROOT = '/Users/ignacywielogorski/Developer'
  const workspaceStore = createWorkspaceStore(openDatabase(':memory:'))
  const router = createCommandRouter({ workspaceStore })

  const saveReply = await router.handleCommand({
    chatId: 12345,
    text: '/repo_add vibe vibe-in-motion'
  })

  const useReply = await router.handleCommand({
    chatId: 12345,
    text: '/repo_use vibe'
  })

  const currentReply = await router.handleCommand({
    chatId: 12345,
    text: '/repo_current'
  })

  const listReply = await router.handleCommand({
    chatId: 12345,
    text: '/repo_list'
  })

  assert.match(saveReply, /Workspace saved\./)
  assert.match(useReply, /Active workspace set to vibe/)
  assert.match(currentReply, /Current workspace: vibe/)
  assert.match(listReply, /\* vibe: /)
})

test('telegram command catalog uses Telegram-safe command names', () => {
  for (const { command } of TELEGRAM_BOT_COMMANDS) {
    assert.match(command, /^[a-z0-9_]{1,32}$/)
  }
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
