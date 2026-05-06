import { runProcess, truncateText } from './process'

export type GitShipInput = {
  prompt: string
  workspacePath: string
}

export type GitShipResult = {
  ok: boolean
  exitCode: number
  message: string
  branch?: string
  commitSha?: string
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

async function runGit(args: string[], cwd: string, timeoutMs: number) {
  return await runProcess({
    command: 'git',
    args,
    cwd,
    timeoutMs
  })
}
