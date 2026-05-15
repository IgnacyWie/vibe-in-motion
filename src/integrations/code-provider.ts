import { runClaudeCodeTask } from './claude-code'
import { runCodexTask, type CodeProvider, type CodeTaskRunInput, type CodeTaskRunResult } from './codex'

export type CodeTaskRunner = (input: CodeTaskRunInput) => Promise<CodeTaskRunResult>
export type { CodeProvider }

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
  return (input.provider || getCodeProvider()) === 'claude'
    ? await runClaudeCodeTask(input)
    : await runCodexTask(input)
}
