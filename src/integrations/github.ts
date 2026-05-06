import { runProcess } from './process'

export type GitHubWatchInput = {
  workspacePath: string
  branch: string
  commitSha: string
}

export type GitHubWatchResult = {
  commitSha: string
  conclusion: string
  name: string
  url: string
}

type GitHubRun = {
  head_sha?: string
  name?: string
  status?: string
  conclusion?: string | null
  html_url?: string
}

export async function watchGitHubDeployment({
  workspacePath,
  branch,
  commitSha
}: GitHubWatchInput): Promise<GitHubWatchResult> {
  const repo = await resolveGitHubRepo(workspacePath)
  const token = process.env.GITHUB_TOKEN

  if (!token) {
    throw new Error('Missing GITHUB_TOKEN.')
  }

  const timeoutMs = Number(process.env.GITHUB_WATCH_TIMEOUT_MS || 30 * 60 * 1000)
  const pollIntervalMs = Number(process.env.GITHUB_POLL_INTERVAL_MS || 15000)
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const runs = await fetchWorkflowRuns({ repo, token, branch, commitSha })
    const run = selectWorkflowRun(runs)

    if (run?.status === 'completed') {
      return {
        commitSha,
        conclusion: run.conclusion || 'unknown',
        name: run.name || 'workflow',
        url: run.html_url || `https://github.com/${repo}/actions`
      }
    }

    await sleep(pollIntervalMs)
  }

  throw new Error(`Timed out waiting for GitHub Actions for ${commitSha}.`)
}

async function fetchWorkflowRuns({
  repo,
  token,
  branch,
  commitSha
}: {
  repo: string
  token: string
  branch: string
  commitSha: string
}) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(commitSha)}&branch=${encodeURIComponent(branch)}&per_page=20`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'vibe-in-motion-bot'
      }
    }
  )

  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as { workflow_runs?: GitHubRun[] }

  return payload.workflow_runs || []
}

function selectWorkflowRun(runs: GitHubRun[]) {
  const matchingRuns = runs.filter(run => run.name?.toLowerCase().startsWith('deploy'))

  return matchingRuns[0] || null
}

async function resolveGitHubRepo(workspacePath: string) {
  const configuredRepo = process.env.GITHUB_REPO?.trim()

  if (configuredRepo) {
    return configuredRepo
  }

  const timeoutMs = Number(process.env.GIT_TIMEOUT_MS || 5 * 60 * 1000)
  const result = await runProcess({
    command: 'git',
    args: ['config', '--get', 'remote.origin.url'],
    cwd: workspacePath,
    timeoutMs
  })

  if (result.exitCode !== 0 || !result.output.trim()) {
    throw new Error('Could not resolve GitHub repository from origin remote.')
  }

  const repo = parseGitHubRepo(result.output.trim())

  if (!repo) {
    throw new Error('Origin remote is not a GitHub repository.')
  }

  return repo
}

function parseGitHubRepo(remoteUrl: string) {
  const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return sshMatch[1]
  }

  const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/)
  if (httpsMatch) {
    return httpsMatch[1]
  }

  return null
}

function sleep(durationMs: number) {
  return new Promise(resolve => {
    setTimeout(resolve, durationMs)
  })
}
