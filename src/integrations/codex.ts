import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { runProcess, truncateText } from './process'

export type CodeProvider = 'codex' | 'claude'

export type CodeTaskRunInput = {
  imagePaths?: string[]
  prompt: string
  provider?: CodeProvider
  workspacePath: string
}

export type CodeTaskRunResult = {
  ok: boolean
  exitCode: number
  message: string
  output: string
  providerName?: string
}

export async function runCodexTask({
  imagePaths = [],
  prompt,
  workspacePath
}: CodeTaskRunInput): Promise<CodeTaskRunResult> {
  const outputFilePath = path.join(
    os.tmpdir(),
    `codex-output-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
  )
  const timeoutMs = Number(process.env.CODEX_TIMEOUT_MS || 20 * 60 * 1000)

  const args = [
    'exec',
    '-C',
    workspacePath,
    '-s',
    'workspace-write',
    '-o',
    outputFilePath
  ]

  for (const imagePath of imagePaths) {
    args.push('--image', imagePath)
  }

  args.push(prompt)

  const result = await runProcess({
    command: 'codex',
    args,
    cwd: workspacePath,
    timeoutMs
  })

  const finalMessage = fs.existsSync(outputFilePath)
    ? fs.readFileSync(outputFilePath, 'utf8').trim()
    : ''

  if (fs.existsSync(outputFilePath)) {
    fs.unlinkSync(outputFilePath)
  }

  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    message: truncateText(finalMessage || result.output || 'Codex finished with no output.'),
    output: truncateText(result.output || ''),
    providerName: 'Codex'
  }
}
