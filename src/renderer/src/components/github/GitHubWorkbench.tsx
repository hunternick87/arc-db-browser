import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  FileDiff,
  FileText,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Github,
  GitPullRequest,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Upload,
  X
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types (mirrored from main/github/types)                           */
/* ------------------------------------------------------------------ */

interface GitRemote {
  name: string
  fetchUrl?: string
  pushUrl?: string
}

type GitChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflict' | 'unknown'

interface GitChangedFile {
  path: string
  originalPath?: string
  stagedStatus: GitChangeKind
  unstagedStatus: GitChangeKind
}

interface GitCommitSummary {
  hash: string
  shortHash: string
  author: string
  relativeDate: string
  subject: string
}

interface GitBranchInfo {
  name: string
  isCurrent: boolean
  isRemote: boolean
}

interface GitRepoStatus {
  repoPath: string
  repoName: string
  branch: string
  upstream?: string
  ahead: number
  behind: number
  isDirty: boolean
  remotes: GitRemote[]
  changedFiles: GitChangedFile[]
  recentCommits: GitCommitSummary[]
  branches: GitBranchInfo[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatError(error?: string): string {
  return error?.trim() || 'The operation failed.'
}

function kindLabel(kind: GitChangeKind): string {
  switch (kind) {
    case 'added': return 'A'
    case 'modified': return 'M'
    case 'deleted': return 'D'
    case 'renamed': return 'R'
    case 'untracked': return 'U'
    case 'conflict': return '!'
    default: return '-'
  }
}

function kindColor(kind: GitChangeKind): string {
  switch (kind) {
    case 'added': return 'text-emerald-400'
    case 'modified': return 'text-amber-400'
    case 'deleted': return 'text-red-400'
    case 'renamed': return 'text-sky-400'
    case 'untracked': return 'text-emerald-400'
    case 'conflict': return 'text-fuchsia-400'
    default: return 'text-muted-foreground'
  }
}

function kindBg(kind: GitChangeKind): string {
  switch (kind) {
    case 'added': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'modified': return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'deleted': return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'renamed': return 'bg-sky-500/15 text-sky-400 border-sky-500/30'
    case 'untracked': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'conflict': return 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30'
    default: return 'bg-muted text-muted-foreground border-border'
  }
}

function fileName(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

function fileDir(path: string): string {
  const parts = path.split(/[/\\]/)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

/* ------------------------------------------------------------------ */
/*  Diff viewer line parser                                           */
/* ------------------------------------------------------------------ */

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header' | 'meta'
  content: string
  oldLine?: number
  newLine?: number
}

function parseDiffOutput(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      lines.push({ type: 'header', content: line })
    } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('new file') || line.startsWith('deleted file')) {
      lines.push({ type: 'meta', content: line })
    } else if (line.startsWith('+')) {
      lines.push({ type: 'add', content: line.slice(1), newLine: newLine++ })
    } else if (line.startsWith('-')) {
      lines.push({ type: 'remove', content: line.slice(1), oldLine: oldLine++ })
    } else {
      lines.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, oldLine: oldLine++, newLine: newLine++ })
    }
  }

  return lines
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function FileStatusBadge({ kind }: { kind: GitChangeKind }): React.JSX.Element {
  return (
    <span className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border text-[10px] font-bold leading-none ${kindBg(kind)}`}>
      {kindLabel(kind)}
    </span>
  )
}

function FileItem({
  file,
  isSelected,
  onClick,
  statusKey
}: {
  file: GitChangedFile
  isSelected: boolean
  onClick: () => void
  statusKey: 'staged' | 'unstaged'
}): React.JSX.Element {
  const kind = statusKey === 'staged' ? file.stagedStatus : file.unstagedStatus
  const name = fileName(file.path)
  const dir = fileDir(file.path)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${isSelected
          ? 'bg-primary/10 ring-1 ring-primary/20'
          : 'hover:bg-muted/70'
        }`}
    >
      <FileStatusBadge kind={kind} />
      <span className={`truncate font-medium ${kindColor(kind)}`}>{name}</span>
      {dir && (
        <span className="ml-auto truncate text-[11px] text-muted-foreground opacity-60">{dir}</span>
      )}
    </button>
  )
}

function DiffViewer({ diffText, isLoading }: { diffText: string; isLoading: boolean }): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading diff…</span>
      </div>
    )
  }

  if (!diffText || diffText === '(no changes)' || diffText === '(no diff available)') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <FileDiff className="h-10 w-10 text-muted-foreground/30" />
        <span className="text-sm text-muted-foreground">No diff to display</span>
      </div>
    )
  }

  const lines = parseDiffOutput(diffText)

  return (
    <ScrollArea className="h-full">
      <div className="font-mono text-[12px] leading-[20px]">
        {lines.map((line, idx) => {
          let bgClass = ''
          let textClass = 'text-foreground/80'
          let gutterOld = ''
          let gutterNew = ''

          switch (line.type) {
            case 'add':
              bgClass = 'bg-emerald-500/10'
              textClass = 'text-emerald-300'
              gutterNew = String(line.newLine ?? '')
              break
            case 'remove':
              bgClass = 'bg-red-500/10'
              textClass = 'text-red-300'
              gutterOld = String(line.oldLine ?? '')
              break
            case 'context':
              gutterOld = String(line.oldLine ?? '')
              gutterNew = String(line.newLine ?? '')
              break
            case 'header':
              bgClass = 'bg-sky-500/8'
              textClass = 'text-sky-400/80'
              break
            case 'meta':
              textClass = 'text-muted-foreground/50'
              break
          }

          return (
            <div key={idx} className={`flex ${bgClass} min-h-[20px]`}>
              {line.type !== 'meta' && line.type !== 'header' && (
                <>
                  <span className="inline-block w-[52px] shrink-0 select-none border-r border-border/30 pr-2 text-right text-muted-foreground/40">
                    {gutterOld}
                  </span>
                  <span className="inline-block w-[52px] shrink-0 select-none border-r border-border/30 pr-2 text-right text-muted-foreground/40">
                    {gutterNew}
                  </span>
                  <span className="inline-block w-[20px] shrink-0 select-none text-center text-muted-foreground/50">
                    {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                  </span>
                </>
              )}
              {(line.type === 'meta' || line.type === 'header') && (
                <span className="inline-block w-[124px] shrink-0" />
              )}
              <span className={`${textClass} whitespace-pre px-2`}>
                {line.content}
              </span>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function CommitHistoryGraph({ commits, selectedHash, onSelect }: {
  commits: GitCommitSummary[]
  selectedHash: string | null
  onSelect: (hash: string) => void
}): React.JSX.Element {
  if (!commits.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
        <GitCommitHorizontal className="h-10 w-10 text-muted-foreground/20" />
        <span className="text-sm text-muted-foreground">No commit history</span>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        {commits.map((commit, idx) => (
          <button
            key={commit.hash}
            type="button"
            onClick={() => onSelect(commit.hash)}
            className={`group flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${selectedHash === commit.hash
                ? 'bg-primary/10 ring-1 ring-primary/20'
                : 'hover:bg-muted/50'
              }`}
          >
            {/* Graph line */}
            <div className="relative flex shrink-0 flex-col items-center pt-0.5">
              <div className={`h-2.5 w-2.5 rounded-full border-2 ${idx === 0
                  ? 'border-primary bg-primary/30'
                  : 'border-muted-foreground/40 bg-transparent'
                }`} />
              {idx < commits.length - 1 && (
                <div className="absolute top-3 h-[calc(100%+8px)] w-px bg-border/50" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-medium">{commit.subject}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="font-mono">{commit.shortHash}</span>
                <span>{commit.author}</span>
                <span className="ml-auto shrink-0">{commit.relativeDate}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function GitHubWorkbench(): React.JSX.Element {
  /* ── State ─────────────────────────────────────────────────────── */

  // Repo connection
  const [repoPath, setRepoPath] = useState('')
  const [status, setStatus] = useState<GitRepoStatus | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState('Select a repository folder to get started.')

  // View state
  const [activeView, setActiveView] = useState<'changes' | 'history'>('changes')
  const [changesSection, setChangesSection] = useState<'staged' | 'unstaged'>('unstaged')
  const [stagedCollapsed, setStagedCollapsed] = useState(false)
  const [unstagedCollapsed, setUnstagedCollapsed] = useState(false)
  const [selectedFile, setSelectedFile] = useState<{ path: string; staged: boolean } | null>(null)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)

  // Diff
  const [diffText, setDiffText] = useState('')
  const [isDiffLoading, setIsDiffLoading] = useState(false)

  // Commit
  const [commitMessage, setCommitMessage] = useState('')

  // Branch / sync
  const [branchName, setBranchName] = useState('')
  const [branchFrom, setBranchFrom] = useState('')
  const [pushBranch, setPushBranch] = useState('')
  const [setUpstream, setSetUpstreamState] = useState(false)

  // PR
  const [prBase, setPrBase] = useState('main')
  const [prHead, setPrHead] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prDraft, setPrDraft] = useState(false)

  // Panel
  const [showActionsPanel, setShowActionsPanel] = useState(false)
  const [actionsTab, setActionsTab] = useState<'branch' | 'pr'>('branch')

  const commitInputRef = useRef<HTMLTextAreaElement>(null)

  /* ── Derived ───────────────────────────────────────────────────── */

  const stagedFiles = useMemo(
    () => (status?.changedFiles ?? []).filter(f => f.stagedStatus !== 'unknown'),
    [status]
  )

  const unstagedFiles = useMemo(
    () => (status?.changedFiles ?? []).filter(f => f.unstagedStatus !== 'unknown'),
    [status]
  )

  const activeBranch = useMemo(
    () => prHead.trim() || status?.branch || '',
    [prHead, status?.branch]
  )

  /* ── Actions ───────────────────────────────────────────────────── */

  const runAction = useCallback(async (operation: () => Promise<{ success: boolean; output?: string; error?: string }>) => {
    setIsBusy(true)
    try {
      const response = await operation()
      if (!response.success) {
        setMessage(formatError(response.error))
        return false
      }
      setMessage(response.output || 'Done.')
      return true
    } catch (error) {
      setMessage((error as Error).message)
      return false
    } finally {
      setIsBusy(false)
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!repoPath.trim()) {
      setMessage('Repository path is required.')
      return
    }
    setIsBusy(true)
    try {
      const response = await window.github.getStatus(repoPath.trim())
      if (!response.success || !response.status) {
        setStatus(null)
        setMessage(formatError(response.error))
        return
      }
      setStatus(response.status)
      setPushBranch(c => c || response.status?.branch || '')
      setPrHead(c => c || response.status?.branch || '')
      setMessage(`Loaded ${response.status.repoName}`)
    } catch (error) {
      setStatus(null)
      setMessage((error as Error).message)
    } finally {
      setIsBusy(false)
    }
  }, [repoPath])

  const pickRepo = useCallback(async () => {
    if (!window.github?.pickRepoDirectory) {
      setMessage('GitHub API unavailable.')
      return
    }
    setIsBusy(true)
    try {
      const picked = await window.github.pickRepoDirectory()
      if (!picked.success || !picked.path) {
        setMessage(picked.canceled ? 'Canceled.' : 'Unable to open picker.')
        return
      }
      setRepoPath(picked.path)
      setStatus(null)
      setMessage(`Selected ${picked.path}`)
    } catch (error) {
      setMessage((error as Error).message || 'Unable to open picker.')
    } finally {
      setIsBusy(false)
    }
  }, [])

  const loadDiff = useCallback(async (filePath: string, staged: boolean) => {
    if (!repoPath.trim()) return
    setIsDiffLoading(true)
    try {
      const res = await window.github.getDiff(repoPath.trim(), filePath, staged)
      setDiffText(res.output || '(no diff)')
    } catch {
      setDiffText('(error loading diff)')
    } finally {
      setIsDiffLoading(false)
    }
  }, [repoPath])

  const handleFileSelect = useCallback((path: string, staged: boolean) => {
    setSelectedFile({ path, staged })
    loadDiff(path, staged)
  }, [loadDiff])

  const handleStageFile = useCallback(async (file: GitChangedFile) => {
    const ok = await runAction(() => window.github.stageFiles(repoPath.trim(), [file.path]))
    if (ok) await refreshStatus()
  }, [repoPath, runAction, refreshStatus])

  const handleUnstageFile = useCallback(async (file: GitChangedFile) => {
    const ok = await runAction(() => window.github.unstageFiles(repoPath.trim(), [file.path]))
    if (ok) await refreshStatus()
  }, [repoPath, runAction, refreshStatus])

  const handleStageAll = useCallback(async () => {
    const paths = unstagedFiles.map(f => f.path)
    if (!paths.length) return
    const ok = await runAction(() => window.github.stageFiles(repoPath.trim(), paths))
    if (ok) await refreshStatus()
  }, [repoPath, unstagedFiles, runAction, refreshStatus])

  const handleUnstageAll = useCallback(async () => {
    const paths = stagedFiles.map(f => f.path)
    if (!paths.length) return
    const ok = await runAction(() => window.github.unstageFiles(repoPath.trim(), paths))
    if (ok) await refreshStatus()
  }, [repoPath, stagedFiles, runAction, refreshStatus])

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) {
      setMessage('Commit message is required.')
      return
    }
    const ok = await runAction(() => window.github.commit(repoPath.trim(), commitMessage.trim()))
    if (ok) {
      setCommitMessage('')
      await refreshStatus()
    }
  }, [repoPath, commitMessage, runAction, refreshStatus])

  const handleFetch = useCallback(async () => {
    const ok = await runAction(() => window.github.fetch(repoPath.trim()))
    if (ok) await refreshStatus()
  }, [repoPath, runAction, refreshStatus])

  const handlePull = useCallback(async () => {
    const ok = await runAction(() => window.github.pull(repoPath.trim(), true))
    if (ok) await refreshStatus()
  }, [repoPath, runAction, refreshStatus])

  const handlePush = useCallback(async () => {
    const ok = await runAction(() =>
      window.github.push(repoPath.trim(), {
        branch: pushBranch.trim() || undefined,
        setUpstream,
        remote: 'origin'
      })
    )
    if (ok) await refreshStatus()
  }, [repoPath, pushBranch, setUpstream, runAction, refreshStatus])

  const handleSync = useCallback(async () => {
    const ok = await runAction(() => window.github.sync(repoPath.trim()))
    if (ok) await refreshStatus()
  }, [repoPath, runAction, refreshStatus])

  const handleCreateBranch = useCallback(async () => {
    if (!branchName.trim()) {
      setMessage('Branch name is required.')
      return
    }
    const ok = await runAction(() =>
      window.github.createBranch(repoPath.trim(), branchName.trim(), branchFrom.trim() || undefined)
    )
    if (ok) {
      setPushBranch(branchName.trim())
      setPrHead(branchName.trim())
      setBranchName('')
      await refreshStatus()
    }
  }, [repoPath, branchName, branchFrom, runAction, refreshStatus])

  const handleCreatePr = useCallback(async () => {
    const ok = await runAction(() =>
      window.github.createPullRequest(repoPath.trim(), {
        base: prBase.trim() || 'main',
        head: activeBranch,
        title: prTitle.trim() || undefined,
        body: prBody.trim() || undefined,
        draft: prDraft
      })
    )
    if (ok) await refreshStatus()
  }, [repoPath, prBase, activeBranch, prTitle, prBody, prDraft, runAction, refreshStatus])

  // Auto-refresh diff when status updates and a file is selected
  useEffect(() => {
    if (selectedFile && status) {
      const exists = status.changedFiles.some(f => f.path === selectedFile.path)
      if (!exists) {
        setSelectedFile(null)
        setDiffText('')
      }
    }
  }, [status, selectedFile])

  /* ── Render ────────────────────────────────────────────────────── */

  const hasRepo = !!status
  const totalChanges = status?.changedFiles.length ?? 0

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">

        {/* ════════════════════════════ LEFT PANEL ════════════════════════════ */}
        <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-border bg-background">

          {/* ── Repo selector header ── */}
          <div className="shrink-0 border-b border-border p-3">
            <div className="flex items-center gap-2">
              <Input
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="C:\\path\\to\\repo"
                className="h-8 flex-1 text-xs"
                disabled={isBusy}
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={pickRepo} disabled={isBusy} title="Browse">
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
              <Button variant="default" size="icon" className="h-8 w-8 shrink-0" onClick={refreshStatus} disabled={isBusy || !repoPath.trim()} title="Open repository">
                <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* Repo info chips */}
            {hasRepo && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="gap-1 text-[11px]">
                  <GitBranch className="h-3 w-3" />
                  {status.branch}
                </Badge>
                {status.upstream && (
                  <Badge variant="outline" className="text-[10px]">{status.upstream}</Badge>
                )}
                {status.ahead > 0 && (
                  <Badge variant="outline" className="gap-0.5 text-[10px] text-emerald-400 border-emerald-500/30">
                    <ArrowUp className="h-2.5 w-2.5" />{status.ahead}
                  </Badge>
                )}
                {status.behind > 0 && (
                  <Badge variant="outline" className="gap-0.5 text-[10px] text-amber-400 border-amber-500/30">
                    <ArrowDown className="h-2.5 w-2.5" />{status.behind}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* ── View switcher ── */}
          {hasRepo && (
            <div className="flex shrink-0 border-b border-border">
              <button
                type="button"
                onClick={() => setActiveView('changes')}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${activeView === 'changes'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                <FileDiff className="h-3.5 w-3.5" />
                Changes
                {totalChanges > 0 && (
                  <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-bold text-primary">
                    {totalChanges}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveView('history')}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${activeView === 'history'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                History
              </button>
            </div>
          )}

          {/* ── Changes view ── */}
          {hasRepo && activeView === 'changes' && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-2">

                  {/* STAGED CHANGES */}
                  <div className="mb-1">
                    <button
                      type="button"
                      onClick={() => setStagedCollapsed(!stagedCollapsed)}
                      className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      {stagedCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Staged Changes
                      <span className="ml-1 text-[10px] font-normal">({stagedFiles.length})</span>
                      <span className="flex-1" />
                      {stagedFiles.length > 0 && (
                        <span
                          onClick={(e) => { e.stopPropagation(); handleUnstageAll() }}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Unstage all"
                        >
                          <Minus className="h-3 w-3" />
                        </span>
                      )}
                    </button>

                    {!stagedCollapsed && (
                      <div className="space-y-0.5 pl-1">
                        {stagedFiles.map(file => (
                          <div key={`s-${file.path}`} className="group flex items-center gap-0.5">
                            <div className="flex-1 min-w-0">
                              <FileItem
                                file={file}
                                isSelected={selectedFile?.path === file.path && selectedFile?.staged === true}
                                onClick={() => handleFileSelect(file.path, true)}
                                statusKey="staged"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleUnstageFile(file)}
                              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                              title="Unstage"
                              disabled={isBusy}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {stagedFiles.length === 0 && (
                          <div className="px-2 py-3 text-center text-[11px] text-muted-foreground/50">
                            No staged changes
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Separator className="my-1.5" />

                  {/* UNSTAGED CHANGES */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setUnstagedCollapsed(!unstagedCollapsed)}
                      className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      {unstagedCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Changes
                      <span className="ml-1 text-[10px] font-normal">({unstagedFiles.length})</span>
                      <span className="flex-1" />
                      {unstagedFiles.length > 0 && (
                        <span
                          onClick={(e) => { e.stopPropagation(); handleStageAll() }}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Stage all"
                        >
                          <Plus className="h-3 w-3" />
                        </span>
                      )}
                    </button>

                    {!unstagedCollapsed && (
                      <div className="space-y-0.5 pl-1">
                        {unstagedFiles.map(file => (
                          <div key={`u-${file.path}`} className="group flex items-center gap-0.5">
                            <div className="flex-1 min-w-0">
                              <FileItem
                                file={file}
                                isSelected={selectedFile?.path === file.path && selectedFile?.staged === false}
                                onClick={() => handleFileSelect(file.path, false)}
                                statusKey="unstaged"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStageFile(file)}
                              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                              title="Stage"
                              disabled={isBusy}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {unstagedFiles.length === 0 && (
                          <div className="px-2 py-3 text-center text-[11px] text-muted-foreground/50">
                            No unstaged changes
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>

              {/* ── Commit area (bottom of left panel) ── */}
              <div className="shrink-0 border-t border-border p-3">
                <Textarea
                  ref={commitInputRef}
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Commit message (Ctrl+Enter to commit)"
                  className="mb-2 min-h-[60px] max-h-[120px] resize-y text-xs"
                  disabled={isBusy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      handleCommit()
                    }
                  }}
                />

                <div className="flex items-center gap-2">
                  <Button
                    className="flex-1"
                    size="sm"
                    onClick={handleCommit}
                    disabled={isBusy || !commitMessage.trim() || stagedFiles.length === 0}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    Commit
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── History view ── */}
          {hasRepo && activeView === 'history' && (
            <div className="min-h-0 flex-1 overflow-hidden">
              <CommitHistoryGraph
                commits={status.recentCommits}
                selectedHash={selectedCommit}
                onSelect={setSelectedCommit}
              />
            </div>
          )}

          {/* ── Empty state ── */}
          {!hasRepo && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
              <Github className="h-12 w-12 text-muted-foreground/20" />
              <h3 className="text-sm font-medium text-muted-foreground">No Repository Loaded</h3>
              <p className="text-center text-[11px] text-muted-foreground/60">
                Enter a repository path above or browse to select a folder, then click refresh to load.
              </p>
            </div>
          )}
        </div>

        {/* ════════════════════════════ RIGHT PANEL ════════════════════════════ */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

          {/* ── Toolbar ── */}
          {hasRepo && (
            <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm">
                <Github className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{status.repoName}</span>
              </div>

              <span className="flex-1" />

              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleFetch} disabled={isBusy || !repoPath.trim()}>
                <ArrowUpDown className="h-3 w-3" />
                Fetch
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handlePull} disabled={isBusy || !repoPath.trim()}>
                <ArrowDown className="h-3 w-3" />
                Pull
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handlePush} disabled={isBusy || !repoPath.trim()}>
                <Upload className="h-3 w-3" />
                Push
              </Button>

              <Separator orientation="vertical" className="h-5" />

              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleSync} disabled={isBusy || !repoPath.trim()}>
                <RefreshCw className="h-3 w-3" />
                Sync
              </Button>
              <Button
                variant={showActionsPanel ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setShowActionsPanel(!showActionsPanel)}
              >
                <GitBranch className="h-3 w-3" />
                Actions
              </Button>
            </div>
          )}

          {/* ── Actions Panel (slide-down) ── */}
          {hasRepo && showActionsPanel && (
            <div className="shrink-0 border-b border-border bg-muted/20 p-4">
              <div className="mx-auto max-w-2xl">
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActionsTab('branch')}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${actionsTab === 'branch' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    <GitBranch className="mr-1 inline-block h-3 w-3" />
                    Branch
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionsTab('pr')}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${actionsTab === 'pr' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    <GitPullRequest className="mr-1 inline-block h-3 w-3" />
                    Pull Request
                  </button>
                </div>

                {actionsTab === 'branch' && (
                  <div className="flex flex-col gap-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Branch name</Label>
                        <Input value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="feature/my-feature" className="h-8 text-xs" disabled={isBusy} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">From branch (optional)</Label>
                        <Input value={branchFrom} onChange={e => setBranchFrom(e.target.value)} placeholder="main" className="h-8 text-xs" disabled={isBusy} />
                      </div>
                    </div>
                    <Button size="sm" onClick={handleCreateBranch} disabled={isBusy || !repoPath.trim() || !branchName.trim()} className="self-start">
                      <GitBranch className="mr-1.5 h-3 w-3" />Create Branch
                    </Button>
                  </div>
                )}

                {actionsTab === 'pr' && (
                  <div className="flex flex-col gap-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Base</Label>
                        <Input value={prBase} onChange={e => setPrBase(e.target.value)} placeholder="main" className="h-8 text-xs" disabled={isBusy} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Head</Label>
                        <Input value={prHead} onChange={e => setPrHead(e.target.value)} placeholder={status?.branch || 'feature/branch'} className="h-8 text-xs" disabled={isBusy} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Title (optional)</Label>
                      <Input value={prTitle} onChange={e => setPrTitle(e.target.value)} placeholder="Add new feature" className="h-8 text-xs" disabled={isBusy} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Body (optional)</Label>
                      <Textarea value={prBody} onChange={e => setPrBody(e.target.value)} placeholder="What changed and why" className="min-h-[50px] text-xs" disabled={isBusy} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="ghwb-pr-draft" checked={prDraft} onCheckedChange={c => setPrDraft(Boolean(c))} disabled={isBusy} />
                      <Label htmlFor="ghwb-pr-draft" className="text-xs text-muted-foreground">Draft PR</Label>
                    </div>
                    <Button size="sm" onClick={handleCreatePr} disabled={isBusy || !repoPath.trim()} className="self-start">
                      <GitPullRequest className="mr-1.5 h-3 w-3" />Create PR
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Diff / content area ── */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedFile ? (
              <div className="flex h-full flex-col">
                <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate text-xs font-medium">{selectedFile.path}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {selectedFile.staged ? 'staged' : 'working tree'}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => { setSelectedFile(null); setDiffText('') }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden bg-background">
                  <DiffViewer diffText={diffText} isLoading={isDiffLoading} />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                {hasRepo ? (
                  <>
                    <FileDiff className="h-14 w-14 text-muted-foreground/15" />
                    <span className="text-sm text-muted-foreground/50">Select a file to view its diff</span>
                  </>
                ) : (
                  <>
                    <Github className="h-14 w-14 text-muted-foreground/15" />
                    <span className="text-sm text-muted-foreground/50">Load a repository to get started</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Status bar ── */}
          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/10 px-3 py-1.5 text-[11px] text-muted-foreground">
            <Github className="h-3 w-3" />
            <span className="truncate">{message}</span>
            {status && (
              <>
                <span className="flex-1" />
                <span className="flex items-center gap-1">
                  <GitCommitHorizontal className="h-3 w-3" />
                  {status.branch}
                </span>
                <span>{status.changedFiles.length} changed</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
