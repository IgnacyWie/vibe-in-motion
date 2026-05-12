import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

export type ProcessRunInput = {
  command: string
  args: string[]
  cwd: string
  timeoutMs: number
}

export async function runProcess({ command, args, cwd, timeoutMs }: ProcessRunInput) {
  return await new Promise<{
    exitCode: number
    output: string
  }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: buildProcessEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const chunks: string[] = []
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      chunks.push(String(chunk))
    })

    child.stderr.on('data', chunk => {
      chunks.push(String(chunk))
    })

    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', code => {
      clearTimeout(timer)
      resolve({
        exitCode: code ?? 1,
        output: chunks.join('').trim()
      })
    })
  })
}

export function buildProcessEnv(baseEnv: NodeJS.ProcessEnv = process.env) {
  const env = { ...baseEnv }
  const pathEntries = new Set<string>()
  const homeDir = env.HOME || os.homedir()
  const pnpmHome = env.PNPM_HOME || path.join(homeDir, 'Library', 'pnpm')
  const fallbackEntries = [
    pnpmHome,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]

  for (const entry of String(env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)) {
    pathEntries.add(entry)
  }

  for (const entry of fallbackEntries) {
    pathEntries.add(entry)
  }

  env.PATH = Array.from(pathEntries).join(path.delimiter)

  if (!env.PNPM_HOME) {
    env.PNPM_HOME = pnpmHome
  }

  return env
}

export function truncateText(value: string, maxLength = 3500) {
  if (value.length <= maxLength) {
    return value
  }

  const marker = '[output truncated]'
  const markerWithSpacing = `${marker}\n`
  const tailLength = Math.max(0, maxLength - markerWithSpacing.length)

  return `${markerWithSpacing}${value.slice(-tailLength)}`
}
