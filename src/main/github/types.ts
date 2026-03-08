export interface GitRemote {
  name: string
  fetchUrl?: string
  pushUrl?: string
}

export type GitChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflict' | 'unknown'

export interface GitChangedFile {
  path: string
  originalPath?: string
  stagedStatus: GitChangeKind
  unstagedStatus: GitChangeKind
}

export interface GitCommitSummary {
  hash: string
  shortHash: string
  author: string
  relativeDate: string
  subject: string
}

export interface GitBranchInfo {
  name: string
  isCurrent: boolean
  isRemote: boolean
}

export interface GitRepoStatus {
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

export interface GitHubStatusResponse {
  success: boolean
  status?: GitRepoStatus
  error?: string
}

export interface GitHubActionResponse {
  success: boolean
  output?: string
  error?: string
}

export interface PushRequest {
  branch?: string
  remote?: string
  setUpstream?: boolean
}

export interface CreatePullRequestRequest {
  base?: string
  head?: string
  title?: string
  body?: string
  draft?: boolean
}
