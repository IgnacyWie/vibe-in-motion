import fs from 'node:fs'
import path from 'node:path'

import { runCodexTask } from './integrations/codex'
import { cloneGitHubRepo, shipGitChanges } from './integrations/git'
import { watchGitHubDeployment } from './integrations/github'
import { runShellCommand } from './integrations/shell'
import { resolveWorkspacePath, type WorkspaceStore } from './storage/workspace-store'

type WorkspaceRecord = {
  alias: string
  path: string
}

type CommandRouterDependencies = {
  shellRunner?: typeof runShellCommand
  codexRunner?: typeof runCodexTask
  gitCloneRunner?: typeof cloneGitHubRepo
  gitShipRunner?: typeof shipGitChanges
  deploymentWatcher?: typeof watchGitHubDeployment
  notifyChat?: (chatId: string | number, message: string) => Promise<void>
  workspaceStore: WorkspaceStore
}

type CommandContext = {
  chatId: string | number
  text: string
}

export type TelegramBotCommand = {
  command: string
  description: string
}

export const TELEGRAM_BOT_COMMANDS: TelegramBotCommand[] = [
  { command: 'start', description: 'Show available commands' },
  { command: 'help', description: 'Show available commands' },
  { command: 'status', description: 'Show the current chat status' },
  { command: 'whoami', description: 'Show your chat ID and active workspace' },
  { command: 'repo_list', description: 'List saved workspaces' },
  { command: 'repo_current', description: 'Show the active workspace' },
  { command: 'repo_pull', description: 'Clone and save a GitHub repo workspace' },
  { command: 'repo_use', description: 'Switch to a saved workspace alias' },
  { command: 'repo_add', description: 'Save a workspace alias for an existing path' },
  { command: 'repo_set', description: 'Update a saved workspace alias path' },
  { command: 'repo_remove', description: 'Remove a saved workspace alias' },
  { command: 'codex', description: 'Run Codex in the active workspace' },
  { command: 'codex_ship', description: 'Run Codex, commit, push, and watch deploys' },
  { command: 'run', description: 'Run a command in the workspace' }
]

export function createCommandRouter({
  codexRunner = runCodexTask,
  gitCloneRunner = cloneGitHubRepo,
  gitShipRunner = shipGitChanges,
  deploymentWatcher = watchGitHubDeployment,
  notifyChat,
  shellRunner = runShellCommand,
  workspaceStore
}: CommandRouterDependencies) {
  return {
    async handleCommand({ chatId, text }: CommandContext) {
      const trimmedText = text.trim()

      if (!trimmedText.startsWith('/')) {
        return buildHelpMessage(workspaceStore.getActiveWorkspace(chatId))
      }

      try {
        const [rawCommand, ...rawArgs] = splitCommand(trimmedText)
        const { command, args } = expandCommandAlias(rawCommand, rawArgs)

        switch (command) {
          case '/help':
          case '/start':
            return buildHelpMessage(workspaceStore.getActiveWorkspace(chatId))
          case '/whoami':
            return buildWhoAmIMessage(chatId, workspaceStore.getActiveWorkspace(chatId))
          case '/status':
            return buildStatusMessage(chatId, workspaceStore.getActiveWorkspace(chatId))
          case '/repo':
            return await handleRepoCommand({
              args,
              chatId,
              gitCloneRunner,
              notifyChat,
              workspaceStore
            })
          case '/codex':
          case '/c':
            return await handleCodexCommand({
              args,
              chatId,
              codexRunner,
              workspaceStore
            })
          case '/codex-ship':
          case '/codex_ship':
          case '/cs':
            return await handleCodexShipCommand({
              args,
              chatId,
              codexRunner,
              gitShipRunner,
              deploymentWatcher,
              notifyChat,
              workspaceStore
            })
          case '/run':
          case '/r':
            return await handleRunCommand({
              args,
              chatId,
              shellRunner,
              workspaceStore
            })
          default:
            return `Unknown command: ${command}\n\n${buildHelpMessage(workspaceStore.getActiveWorkspace(chatId))}`
        }
      } catch (error) {
        return error instanceof Error ? error.message : 'Command failed.'
      }
    }
  }
}

async function handleCodexCommand({
  args,
  chatId,
  codexRunner,
  workspaceStore
}: {
  args: string[]
  chatId: string | number
  codexRunner: typeof runCodexTask
  workspaceStore: WorkspaceStore
}) {
  const prompt = args.join(' ').trim()

  if (!prompt) {
    return 'Usage: /codex <prompt>'
  }

  const workspace = workspaceStore.getActiveWorkspace(chatId)

  if (!workspace) {
    return 'No active workspace. Use /repo use <alias> first.'
  }

  const result = await codexRunner({
    prompt,
    workspacePath: workspace.path
  })

  return [
    `Workspace: ${workspace.alias}`,
    `Exit code: ${result.exitCode}`,
    '',
    result.message
  ].join('\n')
}

async function handleCodexShipCommand({
  args,
  chatId,
  codexRunner,
  gitShipRunner,
  deploymentWatcher,
  notifyChat,
  workspaceStore
}: {
  args: string[]
  chatId: string | number
  codexRunner: typeof runCodexTask
  gitShipRunner: typeof shipGitChanges
  deploymentWatcher: typeof watchGitHubDeployment
  notifyChat?: (chatId: string | number, message: string) => Promise<void>
  workspaceStore: WorkspaceStore
}) {
  const prompt = args.join(' ').trim()

  if (!prompt) {
    return 'Usage: /codex-ship <prompt>'
  }

  const workspace = workspaceStore.getActiveWorkspace(chatId)

  if (!workspace) {
    return 'No active workspace. Use /repo use <alias> first.'
  }

  const codexResult = await codexRunner({
    prompt,
    workspacePath: workspace.path
  })

  if (!codexResult.ok) {
    return [
      `Workspace: ${workspace.alias}`,
      `Exit code: ${codexResult.exitCode}`,
      '',
      codexResult.message
    ].join('\n')
  }

  const gitResult = await gitShipRunner({
    prompt,
    workspacePath: workspace.path
  })

  const watchingMessage =
    gitResult.ok && gitResult.branch && gitResult.commitSha
      ? startDeploymentWatch({
          branch: gitResult.branch,
          chatId,
          commitSha: gitResult.commitSha,
          deploymentWatcher,
          notifyChat,
          workspaceAlias: workspace.alias,
          workspacePath: workspace.path
        })
      : ''

  return [
    `Workspace: ${workspace.alias}`,
    `Codex exit code: ${codexResult.exitCode}`,
    `Git exit code: ${gitResult.exitCode}`,
    '',
    codexResult.message,
    '',
    gitResult.message,
    watchingMessage ? `\n${watchingMessage}` : ''
  ].join('\n')
}

async function handleRunCommand({
  args,
  chatId,
  shellRunner,
  workspaceStore
}: {
  args: string[]
  chatId: string | number
  shellRunner: typeof runShellCommand
  workspaceStore: WorkspaceStore
}) {
  const command = args.join(' ').trim()

  if (!command) {
    return 'Usage: /run <command>'
  }

  const workspace = workspaceStore.getActiveWorkspace(chatId)

  if (!workspace) {
    return 'No active workspace. Use /repo use <alias> first.'
  }

  const cwd = workspace.path

  const result = await shellRunner({
    command,
    cwd
  })

  return [
    `Working directory: ${cwd}`,
    `Exit code: ${result.exitCode}`,
    '',
    result.output
  ].join('\n')
}

async function handleRepoCommand({
  args,
  chatId,
  gitCloneRunner,
  notifyChat,
  workspaceStore
}: {
  args: string[]
  chatId: string | number
  gitCloneRunner: typeof cloneGitHubRepo
  notifyChat?: (chatId: string | number, message: string) => Promise<void>
  workspaceStore: WorkspaceStore
}) {
  const subcommand = args[0]

  switch (subcommand) {
    case 'list': {
      const workspaces = workspaceStore.listWorkspaces()
      const activeWorkspace = workspaceStore.getActiveWorkspace(chatId)

      if (workspaces.length === 0) {
        return 'No workspaces configured. Add one with /repo add <alias> <path-under-Developer>.'
      }

      return workspaces
        .map(workspace => {
          const prefix = activeWorkspace?.alias === workspace.alias ? '* ' : '- '
          return `${prefix}${workspace.alias}: ${workspace.path}`
        })
        .join('\n')
    }
    case 'current': {
      const workspace = workspaceStore.getActiveWorkspace(chatId)

      if (!workspace) {
        return 'No active workspace. Use /repo use <alias> first.'
      }

      return `Current workspace: ${workspace.alias}\nPath: ${workspace.path}`
    }
    case 'pull': {
      const repoSlug = args[1]

      if (!repoSlug) {
        return 'Usage: /repo pull <owner>/<repo> [alias]'
      }

      const repoName = getRepoNameFromSlug(repoSlug)
      const alias = args[2] || repoName
      const normalizedAlias = normalizeWorkspaceAlias(alias)
      const destinationPath = resolveWorkspacePath(repoName)

      if (fs.existsSync(destinationPath)) {
        return `Path already exists under Developer: ${repoName}`
      }

      const cloneResult = await gitCloneRunner({
        destinationPath,
        repoSlug
      })

      if (!cloneResult.ok) {
        if (notifyChat) {
          await notifyChat(
            chatId,
            [
              `Clone failed for ${cloneResult.remoteUrl}`,
              `Exit code: ${cloneResult.exitCode}`,
              '',
              cloneResult.message
            ].join('\n')
          )
        }

        return [
          `Clone failed for ${cloneResult.remoteUrl}`,
          `Exit code: ${cloneResult.exitCode}`,
          '',
          cloneResult.message
        ].join('\n')
      }

      const workspace = workspaceStore.upsertWorkspace(normalizedAlias, repoName)
      workspaceStore.setActiveWorkspace(chatId, workspace.alias)

      if (notifyChat) {
        await notifyChat(chatId, buildStatusMessage(chatId, workspace))
      }

      return [
        'Repository pulled and workspace saved.',
        `Alias: ${workspace.alias}`,
        `Path: ${workspace.path}`,
        `Remote: ${cloneResult.remoteUrl}`,
        '',
        cloneResult.message
      ].join('\n')
    }
    case 'use': {
      const alias = args[1]

      if (!alias) {
        return 'Usage: /repo use <alias>'
      }

      const workspace = workspaceStore.getWorkspace(alias)

      if (!workspace) {
        return `Unknown workspace: ${alias}`
      }

      workspaceStore.setActiveWorkspace(chatId, alias)
      return `Active workspace set to ${workspace.alias}\nPath: ${workspace.path}`
    }
    case 'add':
    case 'set': {
      const alias = args[1]
      const workspacePath = args.slice(2).join(' ').trim()

      if (!alias || !workspacePath) {
        return `Usage: /repo ${subcommand} <alias> <path-under-Developer>`
      }

      const resolvedWorkspacePath = resolveWorkspacePath(workspacePath)

      if (!fs.existsSync(resolvedWorkspacePath)) {
        return `Path does not exist under Developer: ${workspacePath}`
      }

      const workspace = workspaceStore.upsertWorkspace(alias, workspacePath)

      if (!workspaceStore.getActiveWorkspace(chatId)) {
        workspaceStore.setActiveWorkspace(chatId, workspace.alias)
      }

      return `Workspace saved.\nAlias: ${workspace.alias}\nPath: ${workspace.path}`
    }
    case 'remove': {
      const alias = args[1]

      if (!alias) {
        return 'Usage: /repo remove <alias>'
      }

      const workspace = workspaceStore.getWorkspace(alias)

      if (!workspace) {
        return `Unknown workspace: ${alias}`
      }

      const activeWorkspace = workspaceStore.getActiveWorkspace(chatId)
      workspaceStore.deleteWorkspace(alias)

      if (activeWorkspace?.alias === workspace.alias) {
        workspaceStore.clearActiveWorkspace(chatId)
      }

      return `Removed workspace ${workspace.alias}`
    }
    default:
      return [
        'Repo commands:',
        '/repo list',
        '/repo current',
        '/repo pull <owner>/<repo> [alias]',
        '/repo use <alias>',
        '/repo add <alias> <path-under-Developer>',
        '/repo set <alias> <path-under-Developer>',
        '/repo remove <alias>'
      ].join('\n')
  }
}

function buildHelpMessage(activeWorkspace: WorkspaceRecord | null) {
  return [
    'Telegram coding bot',
    activeWorkspace
      ? `Active workspace: ${activeWorkspace.alias} (${activeWorkspace.path})`
      : 'Active workspace: none',
    '',
    '/whoami',
    '/status',
    '/repo list',
    '/repo current',
    '/repo pull <owner>/<repo> [alias]',
    '/repo use <alias>',
    '/repo add <alias> <path-under-Developer>',
    '/repo set <alias> <path-under-Developer>',
    '/repo remove <alias>',
    '/codex <prompt> or /c <prompt>',
    '/codex-ship <prompt> or /cs <prompt>',
    '/run <command> or /r <command>'
  ].join('\n')
}

function startDeploymentWatch({
  branch,
  chatId,
  commitSha,
  deploymentWatcher,
  notifyChat,
  workspaceAlias,
  workspacePath
}: {
  branch: string
  chatId: string | number
  commitSha: string
  deploymentWatcher: typeof watchGitHubDeployment
  notifyChat?: (chatId: string | number, message: string) => Promise<void>
  workspaceAlias: string
  workspacePath: string
}) {
  if (!notifyChat) {
    return ''
  }

  void deploymentWatcher({
    workspacePath,
    branch,
    commitSha
  })
    .then(async result => {
      await notifyChat(
        chatId,
        [
          `Deployment finished for ${workspaceAlias}.`,
          `Workflow: ${result.name}`,
          `Conclusion: ${result.conclusion}`,
          `Commit: ${result.commitSha}`,
          result.url
        ].join('\n')
      )
    })
    .catch(async error => {
      await notifyChat(
        chatId,
        [
          `Deployment watch failed for ${workspaceAlias}.`,
          `Commit: ${commitSha}`,
          error instanceof Error ? error.message : 'Unknown error.'
        ].join('\n')
      )
    })

  return `Watching GitHub Actions for commit ${commitSha}.`
}

function buildStatusMessage(chatId: string | number, activeWorkspace: WorkspaceRecord | null) {
  return [
    `Chat ID: ${chatId}`,
    activeWorkspace
      ? `Active workspace: ${activeWorkspace.alias}`
      : 'Active workspace: none'
  ].join('\n')
}

function buildWhoAmIMessage(chatId: string | number, activeWorkspace: WorkspaceRecord | null) {
  return [
    `Chat ID: ${chatId}`,
    activeWorkspace
      ? `Workspace: ${activeWorkspace.alias}\nPath: ${activeWorkspace.path}`
      : 'Workspace: none'
  ].join('\n')
}

function splitCommand(text: string) {
  return text.match(/"[^"]*"|'[^']*'|\S+/g)?.map(token => token.replace(/^['"]|['"]$/g, '')) || []
}

function expandCommandAlias(rawCommand: string | undefined, args: string[]) {
  const command = normalizeCommand(rawCommand)

  switch (command) {
    case '/repo_list':
      return { command: '/repo', args: ['list', ...args] }
    case '/repo_current':
      return { command: '/repo', args: ['current', ...args] }
    case '/repo_pull':
      return { command: '/repo', args: ['pull', ...args] }
    case '/repo_use':
      return { command: '/repo', args: ['use', ...args] }
    case '/repo_add':
      return { command: '/repo', args: ['add', ...args] }
    case '/repo_set':
      return { command: '/repo', args: ['set', ...args] }
    case '/repo_remove':
      return { command: '/repo', args: ['remove', ...args] }
    default:
      return { command, args }
  }
}

function normalizeCommand(command: string | undefined) {
  return String(command || '')
    .trim()
    .replace(/@[^@\s]+$/, '')
    .toLowerCase()
}

function getRepoNameFromSlug(repoSlug: string) {
  const normalizedSlug = String(repoSlug || '').trim().replace(/\.git$/, '')
  const repoName = normalizedSlug.split('/')[1] || ''

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalizedSlug) || !repoName) {
    throw new Error('Repository must use GitHub owner/repo format, for example IgnacyWie/vibe-in-motion.')
  }

  return path.basename(repoName)
}

function normalizeWorkspaceAlias(alias: string) {
  const normalizedAlias = String(alias || '').trim().toLowerCase()

  if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalizedAlias)) {
    throw new Error('Workspace alias must use lowercase letters, numbers, hyphens, or underscores.')
  }

  return normalizedAlias
}
