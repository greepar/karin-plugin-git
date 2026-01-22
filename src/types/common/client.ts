export type CompatMethods = {
  getCommitInfo: (owner: string, repo: string, branch?: string) => Promise<any>
  getRepoInfo: (owner: string, repo: string) => Promise<any>
  getIssueInfo: (owner: string, repo: string, issueId: string) => Promise<any>
  getIssueList: (
    owner: string,
    repo: string,
    option?: Record<string, unknown>,
  ) => Promise<any>
}

export type ClientType = CompatMethods
