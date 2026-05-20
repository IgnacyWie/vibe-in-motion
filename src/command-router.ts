import fs from 'node:fs'
import path from 'node:path'

import {
  getCodeProvider,
  runCodeProviderTask,
  type CodeProvider,
  type CodeTaskRunner
} from './integrations/code-provider'
import { cloneGitHubRepo, pullGitChanges, rollbackGitLastCommit, shipGitChanges } from './integrations/git'
import { watchGitHubDeployment } from './integrations/github'
import { runShellCommand } from './integrations/shell'
import { resolveWorkspacePath, type WorkspaceStore } from './storage/workspace-store'

type WorkspaceRecord = {
  alias: string
  path: string
}

type CommandRouterDependencies = {
  shellRunner?: typeof runShellCommand
  codexRunner?: CodeTaskRunner
  gitCloneRunner?: typeof cloneGitHubRepo
  gitPullRunner?: typeof pullGitChanges
  gitShipRunner?: typeof shipGitChanges
  gitRollbackRunner?: typeof rollbackGitLastCommit
  deploymentWatcher?: typeof watchGitHubDeployment
  notifyChat?: (chatId: string | number, message: string) => Promise<void>
  workspaceStore: WorkspaceStore
}

type CommandContext = {
  chatId: string | number
  activeWorkspace?: WorkspaceRecord | null
  imagePaths?: string[]
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
  { command: 'provider', description: 'Show or switch the coding provider' },
  { command: 'provider_use', description: 'Switch the coding provider' },
  { command: 'repo_list', description: 'List saved workspaces' },
  { command: 'repo_current', description: 'Show the active workspace' },
  { command: 'repo_pull', description: 'Clone and save a GitHub repo workspace' },
  { command: 'repo_use', description: 'Switch to a saved workspace alias' },
  { command: 'repo_add', description: 'Save a workspace alias for an existing path' },
  { command: 'repo_set', description: 'Update a saved workspace alias path' },
  { command: 'repo_remove', description: 'Remove a saved workspace alias' },
  { command: 'codex', description: 'Run the code provider in the active workspace' },
  { command: 'codex_ship', description: 'Run the code provider, commit, push, and watch deploys' },
  { command: 'rollback', description: 'Rollback the active branch by one commit' },
  { command: 'rb', description: 'Rollback the active branch by one commit' },
  { command: 'run', description: 'Run a command in the workspace' }
]

export function createCommandRouter({
  codexRunner = runCodeProviderTask,
  gitCloneRunner = cloneGitHubRepo,
  gitPullRunner = pullGitChanges,
  gitShipRunner = shipGitChanges,
  gitRollbackRunner = rollbackGitLastCommit,
  deploymentWatcher = watchGitHubDeployment,
  notifyChat,
  shellRunner = runShellCommand,
  workspaceStore
}: CommandRouterDependencies) {
  return {
    async handleCommand({
      activeWorkspace: contextActiveWorkspace,
      chatId,
      imagePaths = [],
      text
    }: CommandContext) {
      const trimmedText = text.trim()

      if (!trimmedText.startsWith('/')) {
        return buildHelpMessage({
          activeProvider: getActiveCodeProvider(chatId, workspaceStore),
          activeWorkspace: workspaceStore.getActiveWorkspace(chatId)
        })
      }

      try {
        const [rawCommand, ...rawArgs] = splitCommand(trimmedText)
        const { command, args } = expandCommandAlias(rawCommand, rawArgs)

        switch (command) {
          case '/help':
          case '/start':
            return buildHelpMessage({
              activeProvider: getActiveCodeProvider(chatId, workspaceStore),
              activeWorkspace: workspaceStore.getActiveWorkspace(chatId)
            })
          case '/whoami':
            return buildWhoAmIMessage({
              activeProvider: getActiveCodeProvider(chatId, workspaceStore),
              activeWorkspace: workspaceStore.getActiveWorkspace(chatId),
              chatId
            })
          case '/status':
            return buildStatusMessage({
              activeProvider: getActiveCodeProvider(chatId, workspaceStore),
              activeWorkspace: workspaceStore.getActiveWorkspace(chatId),
              chatId
            })
          case '/provider':
            return handleProviderCommand({
              args,
              chatId,
              workspaceStore
            })
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
              activeWorkspace: contextActiveWorkspace,
              chatId,
              codexRunner,
              imagePaths,
              gitPullRunner,
              workspaceStore
            })
          case '/codex-ship':
          case '/codex_ship':
          case '/cs':
            return await handleCodexShipCommand({
              args,
              activeWorkspace: contextActiveWorkspace,
              chatId,
              codexRunner,
              gitPullRunner,
              gitShipRunner,
              deploymentWatcher,
              imagePaths,
              notifyChat,
              workspaceStore
            })
          case '/rollback':
          case '/rb':
            return await handleRollbackCommand({
              activeWorkspace: contextActiveWorkspace,
              chatId,
              gitRollbackRunner,
              workspaceStore
            })
          case '/run':
          case '/r':
            return await handleRunCommand({
              args,
              activeWorkspace: contextActiveWorkspace,
              chatId,
              shellRunner,
              workspaceStore
            })
          default:
            return `Unknown command: ${command}\n\n${buildHelpMessage({
              activeProvider: getActiveCodeProvider(chatId, workspaceStore),
              activeWorkspace: workspaceStore.getActiveWorkspace(chatId)
            })}`
        }
      } catch (error) {
        return error instanceof Error ? error.message : 'Command failed.'
      }
    }
  }
}

async function handleRollbackCommand({
  activeWorkspace,
  chatId,
  gitRollbackRunner,
  workspaceStore
}: {
  activeWorkspace?: WorkspaceRecord | null
  chatId: string | number
  gitRollbackRunner: typeof rollbackGitLastCommit
  workspaceStore: WorkspaceStore
}) {
  const workspace = getCommandWorkspace({ activeWorkspace, chatId, workspaceStore })

  if (!workspace) {
    return 'No active workspace. Use /repo use <alias> first.'
  }

  const gitResult = await gitRollbackRunner({
    workspacePath: workspace.path
  })

  return [
    `Workspace: ${workspace.alias}`,
    `Git exit code: ${gitResult.exitCode}`,
    '',
    gitResult.message
  ].join('\n')
}

async function handleCodexCommand({
  activeWorkspace,
  args,
  chatId,
  codexRunner,
  imagePaths,
  gitPullRunner,
  workspaceStore
}: {
  activeWorkspace?: WorkspaceRecord | null
  args: string[]
  chatId: string | number
  codexRunner: CodeTaskRunner
  imagePaths: string[]
  gitPullRunner: typeof pullGitChanges
  workspaceStore: WorkspaceStore
}) {
  const prompt = args.join(' ').trim()

  if (!prompt) {
    return 'Usage: /codex <prompt>'
  }

  const workspace = getCommandWorkspace({ activeWorkspace, chatId, workspaceStore })
  const provider = getActiveCodeProvider(chatId, workspaceStore)

  if (!workspace) {
    return 'No active workspace. Use /repo use <alias> first.'
  }

  const pullResult = await gitPullRunner(workspace.path)

  if (!pullResult.ok) {
    return [
      `Workspace: ${workspace.alias}`,
      `Git pull exit code: ${pullResult.exitCode}`,
      '',
      pullResult.message
    ].join('\n')
  }

  const result = await codexRunner({
    prompt,
    provider,
    imagePaths,
    workspacePath: workspace.path
  })

  return [
    `Workspace: ${workspace.alias}`,
    `Git pull exit code: ${pullResult.exitCode}`,
    `${result.providerName || 'Codex'} exit code: ${result.exitCode}`,
    '',
    result.message
  ].join('\n')
}

async function handleCodexShipCommand({
  activeWorkspace,
  args,
  chatId,
  codexRunner,
  gitPullRunner,
  gitShipRunner,
  deploymentWatcher,
  imagePaths,
  notifyChat,
  workspaceStore
}: {
  activeWorkspace?: WorkspaceRecord | null
  args: string[]
  chatId: string | number
  codexRunner: CodeTaskRunner
  gitPullRunner: typeof pullGitChanges
  gitShipRunner: typeof shipGitChanges
  deploymentWatcher: typeof watchGitHubDeployment
  imagePaths: string[]
  notifyChat?: (chatId: string | number, message: string) => Promise<void>
  workspaceStore: WorkspaceStore
}) {
  const prompt = args.join(' ').trim()

  if (!prompt) {
    return 'Usage: /codex-ship <prompt>'
  }

  const workspace = getCommandWorkspace({ activeWorkspace, chatId, workspaceStore })
  const provider = getActiveCodeProvider(chatId, workspaceStore)

  if (!workspace) {
    return 'No active workspace. Use /repo use <alias> first.'
  }

  const pullResult = await gitPullRunner(workspace.path)

  if (!pullResult.ok) {
    return [
      `Workspace: ${workspace.alias}`,
      `Git pull exit code: ${pullResult.exitCode}`,
      '',
      pullResult.message
    ].join('\n')
  }

  const codeResult = await codexRunner({
    prompt,
    provider,
    imagePaths,
    workspacePath: workspace.path
  })

  const providerName = codeResult.providerName || 'Codex'

  if (!codeResult.ok) {
    return [
      `Workspace: ${workspace.alias}`,
      `${providerName} exit code: ${codeResult.exitCode}`,
      '',
      codeResult.message
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
    `Git pull exit code: ${pullResult.exitCode}`,
    `${providerName} exit code: ${codeResult.exitCode}`,
    `Git exit code: ${gitResult.exitCode}`,
    '',
    codeResult.message,
    '',
    gitResult.message,
    watchingMessage ? `\n${watchingMessage}` : ''
  ].join('\n')
}

async function handleRunCommand({
  activeWorkspace,
  args,
  chatId,
  shellRunner,
  workspaceStore
}: {
  activeWorkspace?: WorkspaceRecord | null
  args: string[]
  chatId: string | number
  shellRunner: typeof runShellCommand
  workspaceStore: WorkspaceStore
}) {
  const command = args.join(' ').trim()

  if (!command) {
    return 'Usage: /run <command>'
  }

  const workspace = getCommandWorkspace({ activeWorkspace, chatId, workspaceStore })

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
        await notifyChat(
          chatId,
          buildStatusMessage({
            activeProvider: getActiveCodeProvider(chatId, workspaceStore),
            activeWorkspace: workspace,
            chatId
          })
        )
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

function handleProviderCommand({
  args,
  chatId,
  workspaceStore
}: {
  args: string[]
  chatId: string | number
  workspaceStore: WorkspaceStore
}) {
  const subcommand = args[0]

  if (!subcommand || subcommand === 'current') {
    return `Current code provider: ${getActiveCodeProvider(chatId, workspaceStore)}`
  }

  const provider = subcommand === 'use' || subcommand === 'set'
    ? args[1]
    : subcommand

  if (!provider) {
    return 'Usage: /provider use <codex|claude>'
  }

  workspaceStore.setActiveCodeProvider(chatId, provider)

  return `Code provider set to ${getActiveCodeProvider(chatId, workspaceStore)}`
}

function buildHelpMessage({
  activeProvider,
  activeWorkspace
}: {
  activeProvider: CodeProvider
  activeWorkspace: WorkspaceRecord | null
}) {
  return [
    'Telegram coding bot',
    activeWorkspace
      ? `Active workspace: ${activeWorkspace.alias} (${activeWorkspace.path})`
      : 'Active workspace: none',
    `Code provider: ${activeProvider}`,
    '',
    '/whoami',
    '/status',
    '/provider current',
    '/provider use <codex|claude>',
    '/repo list',
    '/repo current',
    '/repo pull <owner>/<repo> [alias]',
    '/repo use <alias>',
    '/repo add <alias> <path-under-Developer>',
    '/repo set <alias> <path-under-Developer>',
    '/repo remove <alias>',
    '/codex <prompt> or /c <prompt>',
    '/codex-ship <prompt> or /cs <prompt>',
    '/rollback or /rb',
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

function buildStatusMessage({
  activeProvider,
  activeWorkspace,
  chatId
}: {
  activeProvider: CodeProvider
  activeWorkspace: WorkspaceRecord | null
  chatId: string | number
}) {
  return [
    `Chat ID: ${chatId}`,
    activeWorkspace
      ? `Active workspace: ${activeWorkspace.alias}`
      : 'Active workspace: none',
    `Code provider: ${activeProvider}`
  ].join('\n')
}

function buildWhoAmIMessage({
  activeProvider,
  activeWorkspace,
  chatId
}: {
  activeProvider: CodeProvider
  activeWorkspace: WorkspaceRecord | null
  chatId: string | number
}) {
  return [
    `Chat ID: ${chatId}`,
    activeWorkspace
      ? `Workspace: ${activeWorkspace.alias}\nPath: ${activeWorkspace.path}`
      : 'Workspace: none',
    `Code provider: ${activeProvider}`
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
    case '/provider_use':
      return { command: '/provider', args: ['use', ...args] }
    default:
      return { command, args }
  }
}

function getActiveCodeProvider(chatId: string | number, workspaceStore: WorkspaceStore) {
  return workspaceStore.getActiveCodeProvider(chatId) || getCodeProvider()
}

function getCommandWorkspace({
  activeWorkspace,
  chatId,
  workspaceStore
}: {
  activeWorkspace?: WorkspaceRecord | null
  chatId: string | number
  workspaceStore: WorkspaceStore
}) {
  return activeWorkspace === undefined
    ? workspaceStore.getActiveWorkspace(chatId)
    : activeWorkspace
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
