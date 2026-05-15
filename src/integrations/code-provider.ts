import { runClaudeCodeTask } from './claude-code'
import { runCodexTask, type CodeTaskRunInput, type CodeTaskRunResult } from './codex'

export type CodeProvider = 'codex' | 'claude'

export type CodeTaskRunner = (input: CodeTaskRunInput) => Promise<CodeTaskRunResult>

export function getCodeProvider() {
  const provider = String(process.env.CODE_PROVIDER || 'codex').trim().toLowerCase()

  if (provider === 'claude' || provider === 'claude-code' || provider === 'claude_code') {
    return 'claude'
  }

  if (provider === 'codex') {
    return 'codex'
  }

  throw new Error('CODE_PROVIDER must be one of: codex, claude.')
}

export async function runCodeProviderTask(input: CodeTaskRunInput) {
  return getCodeProvider() === 'claude'
    ? await runClaudeCodeTask(input)
    : await runCodexTask(input)
}
