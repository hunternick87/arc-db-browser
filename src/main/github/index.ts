import { BrowserWindow, dialog, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { basename } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  CreatePullRequestRequest,
  GitBranchInfo,
  GitChangedFile,
  GitChangeKind,
  GitCommitSummary,
  GitRemote,
  GitRepoStatus,
  GitHubActionResponse,
  PushRequest
} from './types'

const REPO_CHANNELS = {
  PICK_REPO_DIR: 'github:pick-repo-dir',
  STATUS: 'github:status',
  FETCH: 'github:fetch',
  PULL: 'github:pull',
  PUSH: 'github:push',
  SYNC: 'github:sync',
  CREATE_BRANCH: 'github:create-branch',
  CREATE_PULL_REQUEST: 'github:create-pr',
  STAGE_FILES: 'github:stage-files',
  UNSTAGE_FILES: 'github:unstage-files',
  COMMIT: 'github:commit',
  GET_DIFF: 'github:get-diff'
} as const

function statusCodeToKind(code: string): GitChangeKind {
  switch (code) {
    case 'A':
      return 'added'
    case 'M':
      return 'modified'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'U':
      return 'conflict'
    case '?':
      return 'untracked'
    default:
      return 'unknown'
  }
}

function parsePorcelain(raw: string): GitChangedFile[] {
  const files: GitChangedFile[] = []

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (line.length < 3) continue

    const x = line[0]
    const y = line[1]
    const pathPart = line.slice(3).trim()
    if (!pathPart) continue

    if (x === '?' && y === '?') {
      files.push({
        path: pathPart,
        stagedStatus: 'untracked',
        unstagedStatus: 'untracked'
      })
      continue
    }

    const renameMatch = pathPart.match(/^(.+?)\s+->\s+(.+)$/)
    const originalPath = renameMatch?.[1]
    const normalizedPath = renameMatch?.[2] || pathPart

    files.push({
      path: normalizedPath,
      originalPath,
      stagedStatus: statusCodeToKind(x),
      unstagedStatus: statusCodeToKind(y)
    })
  }

  return files
}

function parseHistory(raw: string): GitCommitSummary[] {
  const commits: GitCommitSummary[] = []

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    if (parts.length < 5) continue

    const [hash, shortHash, author, relativeDate, subject] = parts
    commits.push({ hash, shortHash, author, relativeDate, subject })
  }

  return commits
}

function parseBranches(raw: string): GitBranchInfo[] {
  const branches: GitBranchInfo[] = []

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const isCurrent = trimmed.startsWith('* ')
    const rawName = (isCurrent ? trimmed.slice(2) : trimmed).trim()
    if (!rawName || rawName.includes('->')) continue

    const isRemote = rawName.startsWith('remotes/')
    const name = isRemote ? rawName.slice('remotes/'.length) : rawName
    branches.push({ name, isCurrent, isRemote })
  }

  return branches
}

interface CommandResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', (error) => {
      resolve({ ok: false, code: 1, stdout, stderr: `${stderr}\n${error.message}`.trim() })
    })

    child.on('close', (code) => {
      resolve({ ok: code === 0, code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

async function ensureRepo(repoPath: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!repoPath || !repoPath.trim()) return { ok: false, error: 'Repository path is required' }

  try {
    const stat = await fs.stat(repoPath)
    if (!stat.isDirectory()) return { ok: false, error: 'Repository path must be a directory' }
  } catch {
    return { ok: false, error: 'Repository path does not exist' }
  }

  const probe = await runCommand('git', ['rev-parse', '--is-inside-work-tree'], repoPath)
  if (!probe.ok || probe.stdout !== 'true') {
    return { ok: false, error: 'Selected directory is not a Git repository' }
  }

  return { ok: true }
}

function parseRemotes(raw: string): GitRemote[] {
  const map = new Map<string, GitRemote>()

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const match = trimmed.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
    if (!match) continue

    const [, name, url, kind] = match
    const existing = map.get(name) ?? { name }

    if (kind === 'fetch') existing.fetchUrl = url
    if (kind === 'push') existing.pushUrl = url

    map.set(name, existing)
  }

  return [...map.values()]
}

function parseGitHubRemoteUrl(remoteUrl?: string): string | undefined {
  if (!remoteUrl) return undefined

  // git@github.com:owner/repo.git -> https://github.com/owner/repo
  const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/)
  if (sshMatch) return `https://github.com/${sshMatch[1]}`

  // https://github.com/owner/repo(.git)
  const httpsMatch = remoteUrl.match(/^https?:\/\/github\.com\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}`

  return undefined
}

async function getCurrentBranch(repoPath: string): Promise<string> {
  const branchResult = await runCommand('git', ['branch', '--show-current'], repoPath)
  if (!branchResult.ok) throw new Error(branchResult.stderr || 'Unable to determine branch')
  return branchResult.stdout.trim()
}

async function getStatus(repoPath: string): Promise<GitRepoStatus> {
  const branch = await getCurrentBranch(repoPath)

  const [porcelain, upstream, remotes, history, branchesRaw] = await Promise.all([
    runCommand('git', ['status', '--porcelain'], repoPath),
    runCommand('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], repoPath),
    runCommand('git', ['remote', '-v'], repoPath),
    runCommand('git', ['log', '--max-count=25', '--pretty=format:%H\t%h\t%an\t%ar\t%s'], repoPath),
    runCommand('git', ['branch', '-a'], repoPath)
  ])

  let ahead = 0
  let behind = 0
  let upstreamName: string | undefined

  if (upstream.ok) {
    upstreamName = upstream.stdout.trim()
    const divergence = await runCommand('git', ['rev-list', '--left-right', '--count', `${upstreamName}...HEAD`], repoPath)
    if (divergence.ok) {
      const parts = divergence.stdout.split(/\s+/).map((n) => Number.parseInt(n, 10))
      if (parts.length >= 2) {
        behind = Number.isFinite(parts[0]) ? parts[0] : 0
        ahead = Number.isFinite(parts[1]) ? parts[1] : 0
      }
    }
  }

  return {
    repoPath,
    repoName: basename(repoPath),
    branch,
    upstream: upstreamName,
    ahead,
    behind,
    isDirty: Boolean(porcelain.stdout.trim()),
    remotes: parseRemotes(remotes.stdout),
    changedFiles: parsePorcelain(porcelain.stdout),
    recentCommits: parseHistory(history.stdout),
    branches: parseBranches(branchesRaw.stdout)
  }
}

function buildActionResponse(success: boolean, output?: string, error?: string): GitHubActionResponse {
  return { success, output, error }
}

export function registerGitHubHandlers(): void {
  ipcMain.handle(REPO_CHANNELS.PICK_REPO_DIR, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(window ?? undefined, {
      title: 'Select Local Git Repository',
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    return { success: true, path: result.filePaths[0] }
  })

  ipcMain.handle(REPO_CHANNELS.STATUS, async (_event, repoPath: string) => {
    const valid = await ensureRepo(repoPath)
    if (!valid.ok) return { success: false, error: valid.error }

    try {
      const status = await getStatus(repoPath)
      return { success: true, status }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(REPO_CHANNELS.PULL, async (_event, repoPath: string, rebase = true): Promise<GitHubActionResponse> => {
    const valid = await ensureRepo(repoPath)
    if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

    const result = await runCommand('git', ['pull', ...(rebase ? ['--rebase'] : [])], repoPath)
    if (!result.ok) return buildActionResponse(false, result.stdout, result.stderr || 'Pull failed')

    return buildActionResponse(true, result.stdout || 'Pull completed')
  })

  ipcMain.handle(REPO_CHANNELS.FETCH, async (_event, repoPath: string): Promise<GitHubActionResponse> => {
    const valid = await ensureRepo(repoPath)
    if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

    const result = await runCommand('git', ['fetch', '--all', '--prune'], repoPath)
    if (!result.ok) return buildActionResponse(false, result.stdout, result.stderr || 'Fetch failed')

    return buildActionResponse(true, result.stdout || 'Fetch completed')
  })

  ipcMain.handle(REPO_CHANNELS.PUSH, async (_event, repoPath: string, req?: PushRequest): Promise<GitHubActionResponse> => {
    const valid = await ensureRepo(repoPath)
    if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

    const branch = req?.branch?.trim()
    const remote = req?.remote?.trim() || 'origin'
    const args = ['push']

    if (req?.setUpstream && branch) args.push('-u')
    if (branch) {
      args.push(remote)
      args.push(branch)
    }

    const result = await runCommand('git', args, repoPath)
    if (!result.ok) return buildActionResponse(false, result.stdout, result.stderr || 'Push failed')

    return buildActionResponse(true, result.stdout || 'Push completed')
  })

  ipcMain.handle(REPO_CHANNELS.SYNC, async (_event, repoPath: string): Promise<GitHubActionResponse> => {
    const valid = await ensureRepo(repoPath)
    if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

    const fetchResult = await runCommand('git', ['fetch', '--all', '--prune'], repoPath)
    if (!fetchResult.ok) return buildActionResponse(false, fetchResult.stdout, fetchResult.stderr || 'Fetch failed')

    const pullResult = await runCommand('git', ['pull', '--rebase'], repoPath)
    if (!pullResult.ok) return buildActionResponse(false, pullResult.stdout, pullResult.stderr || 'Pull failed')

    const pushResult = await runCommand('git', ['push'], repoPath)
    if (!pushResult.ok) return buildActionResponse(false, pushResult.stdout, pushResult.stderr || 'Push failed')

    const output = [fetchResult.stdout, pullResult.stdout, pushResult.stdout].filter(Boolean).join('\n\n') || 'Sync completed'
    return buildActionResponse(true, output)
  })

  ipcMain.handle(
    REPO_CHANNELS.CREATE_BRANCH,
    async (_event, repoPath: string, branchName: string, fromBranch?: string): Promise<GitHubActionResponse> => {
      const valid = await ensureRepo(repoPath)
      if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

      const nextBranch = branchName?.trim()
      if (!nextBranch) return buildActionResponse(false, undefined, 'Branch name is required')

      const args = ['checkout', '-b', nextBranch]
      if (fromBranch?.trim()) args.push(fromBranch.trim())

      const result = await runCommand('git', args, repoPath)
      if (!result.ok) return buildActionResponse(false, result.stdout, result.stderr || 'Create branch failed')

      return buildActionResponse(true, result.stdout || `Branch ${nextBranch} created`)}
  )

  ipcMain.handle(
    REPO_CHANNELS.CREATE_PULL_REQUEST,
    async (_event, repoPath: string, request: CreatePullRequestRequest): Promise<GitHubActionResponse> => {
      const valid = await ensureRepo(repoPath)
      if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

      const branch = request.head?.trim() || (await getCurrentBranch(repoPath))
      const base = request.base?.trim() || 'main'

      const ghArgs = ['pr', 'create', '--head', branch, '--base', base]
      if (request.title?.trim()) ghArgs.push('--title', request.title.trim())
      if (request.body?.trim()) ghArgs.push('--body', request.body.trim())
      if (request.draft) ghArgs.push('--draft')
      if (!request.title?.trim() && !request.body?.trim()) ghArgs.push('--fill')

      const ghResult = await runCommand('gh', ghArgs, repoPath)
      if (ghResult.ok) {
        return buildActionResponse(true, ghResult.stdout || 'Pull request created')
      }

      const remotes = await runCommand('git', ['remote', '-v'], repoPath)
      const parsed = parseRemotes(remotes.stdout)
      const origin = parsed.find((remote) => remote.name === 'origin')
      const webBase = parseGitHubRemoteUrl(origin?.fetchUrl || origin?.pushUrl)

      if (!webBase) {
        return buildActionResponse(
          false,
          undefined,
          `${ghResult.stderr || 'Unable to create PR with GitHub CLI'}\nInstall GitHub CLI (gh) or configure an origin remote that points to github.com.`
        )
      }

      const compareUrl = `${webBase}/compare/${base}...${branch}?expand=1`
      return buildActionResponse(
        false,
        compareUrl,
        `${ghResult.stderr || 'Unable to create PR with GitHub CLI'}. Open the compare URL to create the PR in browser.`
      )
    }
  )

  ipcMain.handle(
    REPO_CHANNELS.STAGE_FILES,
    async (_event, repoPath: string, files: string[]): Promise<GitHubActionResponse> => {
      const valid = await ensureRepo(repoPath)
      if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

      const args = ['add', '--', ...files]
      const result = await runCommand('git', args, repoPath)
      if (!result.ok) return buildActionResponse(false, result.stdout, result.stderr || 'Stage failed')

      return buildActionResponse(true, result.stdout || 'Files staged')
    }
  )

  ipcMain.handle(
    REPO_CHANNELS.UNSTAGE_FILES,
    async (_event, repoPath: string, files: string[]): Promise<GitHubActionResponse> => {
      const valid = await ensureRepo(repoPath)
      if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

      const args = ['reset', 'HEAD', '--', ...files]
      const result = await runCommand('git', args, repoPath)
      if (!result.ok) return buildActionResponse(false, result.stdout, result.stderr || 'Unstage failed')

      return buildActionResponse(true, result.stdout || 'Files unstaged')
    }
  )

  ipcMain.handle(
    REPO_CHANNELS.COMMIT,
    async (_event, repoPath: string, message: string): Promise<GitHubActionResponse> => {
      const valid = await ensureRepo(repoPath)
      if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

      if (!message.trim()) return buildActionResponse(false, undefined, 'Commit message is required')

      const result = await runCommand('git', ['commit', '-m', message.trim()], repoPath)
      if (!result.ok) return buildActionResponse(false, result.stdout, result.stderr || 'Commit failed')

      return buildActionResponse(true, result.stdout || 'Committed successfully')
    }
  )

  ipcMain.handle(
    REPO_CHANNELS.GET_DIFF,
    async (_event, repoPath: string, filePath: string, staged: boolean): Promise<GitHubActionResponse> => {
      const valid = await ensureRepo(repoPath)
      if (!valid.ok) return buildActionResponse(false, undefined, valid.error)

      const args = staged
        ? ['diff', '--cached', '--', filePath]
        : ['diff', '--', filePath]
      const result = await runCommand('git', args, repoPath)

      // If no diff output, try showing the file content for untracked files
      if (!result.stdout.trim() && !staged) {
        const showResult = await runCommand('git', ['diff', '--no-index', '/dev/null', filePath], repoPath)
        return buildActionResponse(true, showResult.stdout || '(no diff available)')
      }

      return buildActionResponse(true, result.stdout || '(no changes)')
    }
  )
}
