import path from 'node:path'

import type { Database } from './database'

export type WorkspaceRecord = {
  alias: string
  path: string
}

export function resolveWorkspacePath(workspacePath: string) {
  const developerRoot = getDeveloperRoot()
  const rawPath = String(workspacePath || '').trim()
  const relativePath = rawPath.replace(/^\/+/, '')
  const normalizedPath = path.resolve(developerRoot, relativePath)

  if (!rawPath) {
    throw new Error('Workspace path must be relative to the Developer directory.')
  }

  if (!isWithinRoot(normalizedPath, developerRoot)) {
    throw new Error(`Workspace path must stay inside ${developerRoot}.`)
  }

  return normalizedPath
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>

export function createWorkspaceStore(database: Database) {
  const listWorkspacesStatement = database.prepare(`
    SELECT alias, path
    FROM workspaces
    ORDER BY alias ASC
  `)
  const getWorkspaceStatement = database.prepare(`
    SELECT alias, path
    FROM workspaces
    WHERE alias = ?
  `)
  const upsertWorkspaceStatement = database.prepare(`
    INSERT INTO workspaces (alias, path, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(alias) DO UPDATE SET
      path = excluded.path,
      updated_at = CURRENT_TIMESTAMP
  `)
  const deleteWorkspaceStatement = database.prepare(`
    DELETE FROM workspaces
    WHERE alias = ?
  `)
  const getActiveWorkspaceStatement = database.prepare(`
    SELECT w.alias, w.path
    FROM chat_state c
    JOIN workspaces w ON w.alias = c.active_workspace_alias
    WHERE c.chat_id = ?
  `)
  const setActiveWorkspaceStatement = database.prepare(`
    INSERT INTO chat_state (chat_id, active_workspace_alias, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id) DO UPDATE SET
      active_workspace_alias = excluded.active_workspace_alias,
      updated_at = CURRENT_TIMESTAMP
  `)
  const clearActiveWorkspaceStatement = database.prepare(`
    UPDATE chat_state
    SET active_workspace_alias = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE chat_id = ?
  `)

  return {
    clearActiveWorkspace(chatId: string | number) {
      clearActiveWorkspaceStatement.run(String(chatId))
    },
    deleteWorkspace(alias: string) {
      deleteWorkspaceStatement.run(normalizeAlias(alias))
    },
    getActiveWorkspace(chatId: string | number) {
      return (
        (getActiveWorkspaceStatement.get(String(chatId)) as WorkspaceRecord | undefined) || null
      )
    },
    getWorkspace(alias: string) {
      return (
        (getWorkspaceStatement.get(normalizeAlias(alias)) as WorkspaceRecord | undefined) || null
      )
    },
    listWorkspaces() {
      return listWorkspacesStatement.all() as WorkspaceRecord[]
    },
    setActiveWorkspace(chatId: string | number, alias: string) {
      setActiveWorkspaceStatement.run(String(chatId), normalizeAlias(alias))
    },
    upsertWorkspace(alias: string, workspacePath: string) {
      const normalizedAlias = normalizeAlias(alias)
      const normalizedPath = resolveWorkspacePath(workspacePath)

      upsertWorkspaceStatement.run(normalizedAlias, normalizedPath)

      return {
        alias: normalizedAlias,
        path: normalizedPath
      }
    }
  }
}

function normalizeAlias(alias: string) {
  const normalizedAlias = String(alias || '').trim().toLowerCase()

  if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalizedAlias)) {
    throw new Error('Workspace alias must use lowercase letters, numbers, hyphens, or underscores.')
  }

  return normalizedAlias
}

function getDeveloperRoot() {
  return path.resolve(process.env.DEVELOPER_ROOT || path.join(process.env.HOME || '', 'Developer'))
}

function isWithinRoot(candidatePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, candidatePath)

  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}
