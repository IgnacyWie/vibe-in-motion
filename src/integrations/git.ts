import { runProcess, truncateText } from './process'

export type GitShipInput = {
  prompt: string
  workspacePath: string
}

export type GitCloneInput = {
  destinationPath: string
  repoSlug: string
}

export type GitCloneResult = {
  ok: boolean
  exitCode: number
  message: string
  remoteUrl: string
}

export type GitShipResult = {
  ok: boolean
  exitCode: number
  message: string
  branch?: string
  commitSha?: string
}

export type GitRollbackInput = {
  workspacePath: string
}

export type GitRollbackResult = {
  ok: boolean
  exitCode: number
  message: string
  branch?: string
  backupBranch?: string
  rolledBackFrom?: string
  rolledBackTo?: string
}

export async function cloneGitHubRepo({
  destinationPath,
  repoSlug
}: GitCloneInput): Promise<GitCloneResult> {
  const timeoutMs = Number(process.env.GIT_TIMEOUT_MS || 5 * 60 * 1000)
  const remoteUrl = buildGitHubSshUrl(repoSlug)
  const result = await runGit(['clone', remoteUrl, destinationPath], process.cwd(), timeoutMs)

  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    remoteUrl,
    message: truncateText(result.output || 'git clone finished.')
  }
}

export async function shipGitChanges({
  prompt,
  workspacePath
}: GitShipInput): Promise<GitShipResult> {
  const timeoutMs = Number(process.env.GIT_TIMEOUT_MS || 5 * 60 * 1000)

  await assertGitRepo(workspacePath, timeoutMs)

  const changedFilesBeforeStage = await getChangedFiles(workspacePath, timeoutMs)

  if (changedFilesBeforeStage.length === 0) {
    return {
      ok: false,
      exitCode: 0,
      message: 'No git changes detected. Nothing to commit or push.'
    }
  }

  await runGit(['add', '-A'], workspacePath, timeoutMs)

  const changedFiles = await getStagedFiles(workspacePath, timeoutMs)

  if (changedFiles.length === 0) {
    return {
      ok: false,
      exitCode: 0,
      message: 'No staged changes detected after git add.'
    }
  }

  const branch = await getCurrentBranch(workspacePath, timeoutMs)
  const commitMessage = buildCommitMessage(prompt, changedFiles)
  const commitResult = await runGit(['commit', '-m', commitMessage], workspacePath, timeoutMs)

  if (commitResult.exitCode !== 0) {
    return {
      ok: false,
      exitCode: commitResult.exitCode,
      message: truncateText(commitResult.output || 'git commit failed.'),
      branch
    }
  }

  const commitSha = await getCommitSha(workspacePath, timeoutMs)
  const pushResult = await runGit(['push'], workspacePath, timeoutMs)

  return {
    ok: pushResult.exitCode === 0,
    exitCode: pushResult.exitCode,
    branch,
    commitSha,
    message: [
      `Branch: ${branch}`,
      `Commit SHA: ${commitSha}`,
      `Commit: ${commitMessage}`,
      `Files: ${changedFiles.join(', ')}`,
      '',
      truncateText(pushResult.output || 'git push finished.')
    ].join('\n')
  }
}

export async function rollbackGitLastCommit({
  workspacePath
}: GitRollbackInput): Promise<GitRollbackResult> {
  const timeoutMs = Number(process.env.GIT_TIMEOUT_MS || 5 * 60 * 1000)

  await assertGitRepo(workspacePath, timeoutMs)

  const changedFiles = await getChangedFiles(workspacePath, timeoutMs)

  if (changedFiles.length > 0) {
    return {
      ok: false,
      exitCode: 1,
      message: [
        'Rollback refused because the worktree has uncommitted changes.',
        'Commit, stash, or discard them before rolling back.',
        `Files: ${changedFiles.join(', ')}`
      ].join('\n')
    }
  }

  const branch = await getCurrentBranch(workspacePath, timeoutMs)
  const rolledBackFrom = await getCommitSha(workspacePath, timeoutMs)
  const rolledBackTo = await getRevisionSha(workspacePath, 'HEAD~1', timeoutMs)
  const backupBranch = buildRollbackBranchName(branch, rolledBackFrom)
  const createBranchResult = await runGit(['branch', backupBranch, rolledBackFrom], workspacePath, timeoutMs)

  if (createBranchResult.exitCode !== 0) {
    return {
      ok: false,
      exitCode: createBranchResult.exitCode,
      branch,
      backupBranch,
      rolledBackFrom,
      rolledBackTo,
      message: truncateText(createBranchResult.output || 'Could not create rollback backup branch.')
    }
  }

  const pushBackupResult = await runGit(
    ['push', 'origin', `${backupBranch}:${backupBranch}`],
    workspacePath,
    timeoutMs
  )

  if (pushBackupResult.exitCode !== 0) {
    return {
      ok: false,
      exitCode: pushBackupResult.exitCode,
      branch,
      backupBranch,
      rolledBackFrom,
      rolledBackTo,
      message: [
        'Rollback stopped before resetting because the backup branch could not be pushed.',
        '',
        truncateText(pushBackupResult.output || 'git push backup branch failed.')
      ].join('\n')
    }
  }

  const resetResult = await runGit(['reset', '--hard', rolledBackTo], workspacePath, timeoutMs)

  if (resetResult.exitCode !== 0) {
    return {
      ok: false,
      exitCode: resetResult.exitCode,
      branch,
      backupBranch,
      rolledBackFrom,
      rolledBackTo,
      message: truncateText(resetResult.output || 'git reset --hard failed.')
    }
  }

  const pushRollbackResult = await runGit(
    ['push', '--force-with-lease', 'origin', `${branch}:${branch}`],
    workspacePath,
    timeoutMs
  )

  return {
    ok: pushRollbackResult.exitCode === 0,
    exitCode: pushRollbackResult.exitCode,
    branch,
    backupBranch,
    rolledBackFrom,
    rolledBackTo,
    message: [
      `Branch: ${branch}`,
      `Rolled back from: ${rolledBackFrom}`,
      `Rolled back to: ${rolledBackTo}`,
      `Backup branch: ${backupBranch}`,
      '',
      truncateText(pushRollbackResult.output || 'git push rollback finished.')
    ].join('\n')
  }
}

async function assertGitRepo(workspacePath: string, timeoutMs: number) {
  const result = await runGit(['rev-parse', '--is-inside-work-tree'], workspacePath, timeoutMs)

  if (result.exitCode !== 0 || result.output.trim() !== 'true') {
    throw new Error('Active workspace is not a git repository.')
  }
}

async function getChangedFiles(workspacePath: string, timeoutMs: number) {
  const result = await runGit(['status', '--porcelain'], workspacePath, timeoutMs)

  if (result.exitCode !== 0) {
    throw new Error(result.output || 'git status failed.')
  }

  return result.output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[A-Z?]+\s+/, ''))
}

async function getStagedFiles(workspacePath: string, timeoutMs: number) {
  const result = await runGit(['diff', '--cached', '--name-only'], workspacePath, timeoutMs)

  if (result.exitCode !== 0) {
    throw new Error(result.output || 'git diff --cached failed.')
  }

  return result.output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

async function getCurrentBranch(workspacePath: string, timeoutMs: number) {
  const result = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], workspacePath, timeoutMs)

  if (result.exitCode !== 0) {
    throw new Error(result.output || 'git rev-parse failed.')
  }

  const branch = result.output.trim()

  if (!branch || branch === 'HEAD') {
    throw new Error('Cannot push from a detached HEAD.')
  }

  return branch
}

async function getCommitSha(workspacePath: string, timeoutMs: number) {
  const result = await runGit(['rev-parse', 'HEAD'], workspacePath, timeoutMs)

  if (result.exitCode !== 0) {
    throw new Error(result.output || 'git rev-parse HEAD failed.')
  }

  const commitSha = result.output.trim()

  if (!commitSha) {
    throw new Error('Could not determine commit SHA.')
  }

  return commitSha
}

async function getRevisionSha(workspacePath: string, revision: string, timeoutMs: number) {
  const result = await runGit(['rev-parse', revision], workspacePath, timeoutMs)

  if (result.exitCode !== 0) {
    throw new Error(result.output || `Could not resolve ${revision}.`)
  }

  const commitSha = result.output.trim()

  if (!commitSha) {
    throw new Error(`Could not determine commit SHA for ${revision}.`)
  }

  return commitSha
}

function buildCommitMessage(prompt: string, changedFiles: string[]) {
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim()
  const shortPrompt = normalizedPrompt.slice(0, 52).trim()
  const scope = inferScope(changedFiles)

  return `chore(${scope}): ${shortPrompt || 'update via codex'}`
}

function inferScope(changedFiles: string[]) {
  const firstFile = changedFiles[0] || 'repo'
  const topLevelSegment = firstFile.split('/')[0] || 'repo'

  return topLevelSegment.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'repo'
}

function buildRollbackBranchName(branch: string, commitSha: string) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z')
  const safeBranch = branch.replace(/[^A-Za-z0-9._/-]/g, '-').replace(/^\/+|\/+$/g, '')

  return `rollback/${safeBranch || 'branch'}-${commitSha.slice(0, 12)}-${timestamp}`
}

async function runGit(args: string[], cwd: string, timeoutMs: number) {
  return await runProcess({
    command: 'git',
    args,
    cwd,
    timeoutMs
  })
}

function buildGitHubSshUrl(repoSlug: string) {
  const normalizedSlug = String(repoSlug || '').trim().replace(/\.git$/, '')

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalizedSlug)) {
    throw new Error('Repository must use GitHub owner/repo format, for example IgnacyWie/vibe-in-motion.')
  }

  return `git@github.com:${normalizedSlug}.git`
}
