import { runProcess, truncateText } from './process'

export type ShellRunInput = {
  command: string
  cwd: string
}

export async function runShellCommand({ command, cwd }: ShellRunInput) {
  const trimmedCommand = String(command || '').trim()

  if (!trimmedCommand) {
    throw new Error('Missing command.')
  }

  if (containsBlockedShellSyntax(trimmedCommand)) {
    throw new Error('Shell metacharacters are blocked. Run a plain command without pipes or redirects.')
  }

  const argv = tokenizeCommand(trimmedCommand)

  if (argv.length === 0) {
    throw new Error('Missing command.')
  }

  assertCommandAllowed(argv)

  const timeoutMs = Number(process.env.SHELL_TIMEOUT_MS || 5 * 60 * 1000)

  const result = await runProcess({
    command: argv[0],
    args: argv.slice(1),
    cwd,
    timeoutMs
  })

  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    output: truncateText(result.output || 'Command finished with no output.')
  }
}

export function getAllowedCommandPrefixes() {
  const rawValue =
    process.env.RUN_COMMAND_ALLOWLIST ||
    [
      'git status',
      'git pull',
      'git log',
      'pnpm test',
      'pnpm build',
      'pnpm install',
      'pnpm run dev',
      'kubectl get pods',
      'kubectl get deployments',
      'docker ps',
      'ls',
      'pwd'
    ].join(',')

  return rawValue
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

function assertCommandAllowed(argv: string[]) {
  const allowedPrefixes = getAllowedCommandPrefixes().map(prefix => tokenizeCommand(prefix))
  const isAllowed = allowedPrefixes.some(prefixTokens => {
    if (prefixTokens.length > argv.length) {
      return false
    }

    return prefixTokens.every((token, index) => argv[index] === token)
  })

  if (!isAllowed) {
    throw new Error(
      `Command is not allowed. Allowed prefixes: ${getAllowedCommandPrefixes().join(', ')}`
    )
  }
}

function containsBlockedShellSyntax(command: string) {
  return /[|&;<>`$()]/.test(command)
}

function tokenizeCommand(command: string) {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) || []

  return tokens.map(token => token.replace(/^['"]|['"]$/g, ''))
}
