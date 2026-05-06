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
      env: process.env,
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

export function truncateText(value: string, maxLength = 3500) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 18)}\n[output truncated]`
}
