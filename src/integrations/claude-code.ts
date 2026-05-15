import { runProcess, truncateText } from './process'
import type { CodeTaskRunInput, CodeTaskRunResult } from './codex'

export async function runClaudeCodeTask({
  prompt,
  workspacePath
}: CodeTaskRunInput): Promise<CodeTaskRunResult> {
  const timeoutMs = Number(process.env.CLAUDE_CODE_TIMEOUT_MS || 20 * 60 * 1000)

  const result = await runProcess({
    command: process.env.CLAUDE_CODE_COMMAND || 'claude',
    args: [
      '-p',
      prompt,
      '--output-format',
      'text',
      '--permission-mode',
      process.env.CLAUDE_CODE_PERMISSION_MODE || 'acceptEdits'
    ],
    cwd: workspacePath,
    timeoutMs
  })

  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    message: truncateText(result.output || 'Claude Code finished with no output.'),
    output: truncateText(result.output || ''),
    providerName: 'Claude Code'
  }
}
