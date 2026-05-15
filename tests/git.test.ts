import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import { rollbackGitLastCommit } from '../src/integrations/git'

const execFileAsync = promisify(execFile)

test('rollbackGitLastCommit backs up HEAD, resets one commit, and force pushes', async () => {
  const { remotePath, workspacePath } = await createRepoWithTwoPushedCommits()
  const secondCommit = await gitOutput(['rev-parse', 'HEAD'], workspacePath)
  const firstCommit = await gitOutput(['rev-parse', 'HEAD~1'], workspacePath)

  const result = await rollbackGitLastCommit({ workspacePath })

  assert.equal(result.ok, true)
  assert.equal(result.exitCode, 0)
  assert.equal(result.branch, 'main')
  assert.equal(result.rolledBackFrom, secondCommit)
  assert.equal(result.rolledBackTo, firstCommit)
  assert.match(result.backupBranch || '', /^rollback\/main-[0-9a-f]{12}-\d{8}T\d{6}Z$/)

  const localHead = await gitOutput(['rev-parse', 'HEAD'], workspacePath)
  const remoteMain = await gitOutput(['rev-parse', 'main'], remotePath)
  const remoteBackup = await gitOutput(['rev-parse', result.backupBranch || ''], remotePath)

  assert.equal(localHead, firstCommit)
  assert.equal(remoteMain, firstCommit)
  assert.equal(remoteBackup, secondCommit)
})

test('rollbackGitLastCommit refuses a dirty worktree', async () => {
  const { workspacePath } = await createRepoWithTwoPushedCommits()
  fs.appendFileSync(path.join(workspacePath, 'app.txt'), '\ndirty change\n')

  const result = await rollbackGitLastCommit({ workspacePath })

  assert.equal(result.ok, false)
  assert.equal(result.exitCode, 1)
  assert.match(result.message, /worktree has uncommitted changes/)
})

async function createRepoWithTwoPushedCommits() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-git-'))
  const remotePath = path.join(root, 'remote.git')
  const workspacePath = path.join(root, 'workspace')

  fs.mkdirSync(workspacePath)
  await git(['init', '--bare', remotePath], root)
  await git(['init'], workspacePath)
  await git(['config', 'user.email', 'bot@example.com'], workspacePath)
  await git(['config', 'user.name', 'Test Bot'], workspacePath)

  fs.writeFileSync(path.join(workspacePath, 'app.txt'), 'first\n')
  await git(['add', 'app.txt'], workspacePath)
  await git(['commit', '-m', 'first'], workspacePath)
  await git(['branch', '-M', 'main'], workspacePath)
  await git(['remote', 'add', 'origin', remotePath], workspacePath)
  await git(['push', '-u', 'origin', 'main'], workspacePath)

  fs.writeFileSync(path.join(workspacePath, 'app.txt'), 'second\n')
  await git(['commit', '-am', 'second'], workspacePath)
  await git(['push'], workspacePath)

  return { remotePath, workspacePath }
}

async function git(args: string[], cwd: string) {
  await execFileAsync('git', args, { cwd })
}

async function gitOutput(args: string[], cwd: string) {
  const { stdout } = await execFileAsync('git', args, { cwd })

  return stdout.trim()
}
