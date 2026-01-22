import { Config } from '@/common'
import { isEmpty } from 'es-toolkit/compat'
import { CnbClient, GitCodeClient, GiteeClient, GithubClient } from 'nipaw'

const normalizeIssueState = (state: string | undefined) => {
  if (state === 'open') return 'Opened'
  if (state === 'closed') return 'Closed'
  return state ?? ''
}

const attachCompatMethods = (client: object) => {
  const typed = client as {
    getCommitInfo?: (...args: any[]) => Promise<any>
    getRepoInfo?: (...args: any[]) => Promise<any>
    getIssueInfo?: (...args: any[]) => Promise<any>
    getIssueList?: (...args: any[]) => Promise<any>
    commit?: () => { info: Function; list: Function }
    repo?: () => { info: Function }
    issue?: () => { info: Function; list: Function }
  }

  if (!typed.getCommitInfo && typed.commit) {
    typed.getCommitInfo = async (
      owner: string,
      repo: string,
      branch?: string,
    ) => {
      if (branch) {
        const list = await typed.commit!().list(owner, repo, {
          sha: branch,
          perPage: 1,
          page: 1,
        })
        return list?.[0] ?? null
      }
      return typed.commit!().info(owner, repo)
    }
  }

  if (!typed.getRepoInfo && typed.repo) {
    typed.getRepoInfo = (owner: string, repo: string) =>
      typed.repo!().info(owner, repo)
  }

  if (!typed.getIssueInfo && typed.issue) {
    typed.getIssueInfo = (owner: string, repo: string, issueId: string) =>
      typed.issue!().info(owner, repo, issueId)
  }

  if (!typed.getIssueList && typed.issue) {
    typed.getIssueList = (
      owner: string,
      repo: string,
      option?: Record<string, unknown>,
    ) => typed.issue!().list(owner, repo, option)
  }

  return typed
}

const createFetchWithProxy = (proxy: string) => {
  let proxyAgentPromise: Promise<any> | null = null
  return async (url: string, options: RequestInit = {}) => {
    if (proxy) {
      if (!proxyAgentPromise) {
        proxyAgentPromise = import('undici')
          .then((m: any) => new m.ProxyAgent(proxy))
          .catch(() => null)
      }
      const agent = await proxyAgentPromise
      if (agent) {
        ;(options as any).dispatcher = agent
      }
    }
    return fetch(url, options)
  }
}

const toDataUrl = async (
  fetchWithProxy: (url: string, options?: RequestInit) => Promise<Response>,
  url: string | undefined,
) => {
  if (!url || url.startsWith('data:')) return url
  const res = await fetchWithProxy(url)
  if (!res.ok) return url
  const type = res.headers.get('content-type') || 'image/png'
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:${type};base64,${buf.toString('base64')}`
}

export const github = () => {
  const client = new GithubClient()
  if (!isEmpty(Config.github.reverseProxy)) {
    client.setReverseProxy(Config.github.reverseProxy)
  } else if (!isEmpty(Config.github.proxy)) {
    client.setProxy(Config.github.proxy)
  }
  if (!isEmpty(Config.github.token)) {
    client.setToken(Config.github.token)
  }
  const typed = attachCompatMethods(client)
  const reverseProxy = (Config.github.reverseProxy || '').trim()
  const proxy = (Config.github.proxy || '').trim()
  const baseUrl = reverseProxy
    ? reverseProxy.includes('api.github.com')
      ? reverseProxy.replace(/\/$/, '')
      : `${reverseProxy.replace(/\/$/, '')}/https://api.github.com`
    : 'https://api.github.com'

  const fetchWithProxy = createFetchWithProxy(proxy)

  const buildHeaders = () => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'karin-plugin-git',
    }
    if (!isEmpty(Config.github.token)) {
      headers.Authorization = `Bearer ${Config.github.token}`
    }
    return headers
  }

  const fetchJson = async (path: string) => {
    const res = await fetchWithProxy(`${baseUrl}${path}`, {
      headers: buildHeaders(),
    })
    if (!res.ok) {
      const error = new Error(`GitHub API ${res.status}`)
      ;(error as { status?: number }).status = res.status
      throw error
    }
    return res.json()
  }

  typed.getCommitInfo = async (
    owner: string,
    repo: string,
    branch?: string,
  ) => {
    try {
      const query = branch
        ? `?sha=${encodeURIComponent(branch)}&per_page=1`
        : '?per_page=1'
      const data = await fetchJson(`/repos/${owner}/${repo}/commits${query}`)
      const commit = Array.isArray(data) ? data[0] ?? null : data
      if (!commit) return null
      if (!commit.stats) {
        commit.stats = { additions: 0, deletions: 0, total: 0 }
      }
      if (commit.author?.avatar_url && commit.commit?.author) {
        commit.commit.author.avatarUrl = commit.author.avatar_url
      }
      if (commit.committer?.avatar_url && commit.commit?.committer) {
        commit.commit.committer.avatarUrl = commit.committer.avatar_url
      }
      if (commit.commit?.author?.avatarUrl) {
        commit.commit.author.avatarUrl = await toDataUrl(
          fetchWithProxy,
          commit.commit.author.avatarUrl,
        )
      }
      if (commit.commit?.committer?.avatarUrl) {
        commit.commit.committer.avatarUrl = await toDataUrl(
          fetchWithProxy,
          commit.commit.committer.avatarUrl,
        )
      }
      return commit
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status === 404 || status === 422) return null
      throw error
    }
  }

  typed.getRepoInfo = async (owner: string, repo: string) => {
    const data = await fetchJson(`/repos/${owner}/${repo}`)
    return { ...data, defaultBranch: data.default_branch }
  }

  typed.getIssueInfo = async (owner: string, repo: string, issueId: string) => {
    const data = await fetchJson(`/repos/${owner}/${repo}/issues/${issueId}`)
    const user = data.user || {}
    const avatarUrl = await toDataUrl(
      fetchWithProxy,
      user.avatar_url || user.avatarUrl,
    )
    return {
      ...data,
      createdAt: new Date(data.created_at),
      state: normalizeIssueState(data.state),
      user: {
        ...user,
        name: user.login || user.name,
        avatarUrl,
      },
    }
  }

  typed.getIssueList = async (
    owner: string,
    repo: string,
    option?: Record<string, unknown>,
  ) => {
    const params = new URLSearchParams()
    if (option?.perPage) params.set('per_page', String(option.perPage))
    if (option?.page) params.set('page', String(option.page))
    const list = await fetchJson(
      `/repos/${owner}/${repo}/issues?${params.toString()}`,
    )
    return (list as Array<any>)
      .filter((item) => !item.pull_request)
      .map((item) => ({
        ...item,
        createdAt: new Date(item.created_at),
        state: normalizeIssueState(item.state),
        user: {
          ...item.user,
          name: item.user?.login || item.user?.name,
          avatarUrl: item.user?.avatar_url || item.user?.avatarUrl,
        },
      }))
  }

  return typed
}

export const codeberg = () => {
  const baseUrl = (Config.codeberg.baseUrl || '').replace(/\/$/, '')
  const proxy = (Config.codeberg.proxy || '').trim()
  const token = (Config.codeberg.token || '').trim()
  const fetchWithProxy = createFetchWithProxy(proxy)
  const apiBase = baseUrl || 'https://codeberg.org/api/v1'

  const buildHeaders = () => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'karin-plugin-git',
    }
    if (token) {
      headers.Authorization = `token ${token}`
    }
    return headers
  }

  const fetchJson = async (path: string) => {
    const res = await fetchWithProxy(`${apiBase}${path}`, {
      headers: buildHeaders(),
    })
    if (!res.ok) {
      const error = new Error(`Codeberg API ${res.status}`)
      ;(error as { status?: number }).status = res.status
      throw error
    }
    return res.json()
  }

  return {
    async getRepoInfo(owner: string, repo: string) {
      const data = await fetchJson(`/repos/${owner}/${repo}`)
      return { ...data, defaultBranch: data.default_branch }
    },
    async getCommitInfo(owner: string, repo: string, branch?: string) {
      const params = new URLSearchParams()
      if (branch) params.set('sha', branch)
      params.set('limit', '1')
      const data = await fetchJson(
        `/repos/${owner}/${repo}/commits?${params.toString()}`,
      )
      const commit = Array.isArray(data) ? data[0] ?? null : data
      if (!commit) return null
      if (!commit.stats) {
        commit.stats = { additions: 0, deletions: 0, total: 0 }
      }
      if (commit.author?.avatar_url && commit.commit?.author) {
        commit.commit.author.avatarUrl = commit.author.avatar_url
      }
      if (commit.committer?.avatar_url && commit.commit?.committer) {
        commit.commit.committer.avatarUrl = commit.committer.avatar_url
      }
      if (commit.commit?.author?.avatarUrl) {
        commit.commit.author.avatarUrl = await toDataUrl(
          fetchWithProxy,
          commit.commit.author.avatarUrl,
        )
      }
      if (commit.commit?.committer?.avatarUrl) {
        commit.commit.committer.avatarUrl = await toDataUrl(
          fetchWithProxy,
          commit.commit.committer.avatarUrl,
        )
      }
      return commit
    },
    async getIssueInfo(owner: string, repo: string, issueId: string) {
      const data = await fetchJson(`/repos/${owner}/${repo}/issues/${issueId}`)
      const avatarUrl = await toDataUrl(
        fetchWithProxy,
        data.user?.avatar_url || data.user?.avatarUrl,
      )
      return {
        ...data,
        createdAt: new Date(data.created_at),
        state: normalizeIssueState(data.state),
        user: {
          ...data.user,
          name: data.user?.login || data.user?.name,
          avatarUrl,
        },
      }
    },
    async getIssueList(
      owner: string,
      repo: string,
      option?: Record<string, unknown>,
    ) {
      const params = new URLSearchParams()
      if (option?.perPage) params.set('limit', String(option.perPage))
      if (option?.page) params.set('page', String(option.page))
      params.set('type', 'issues')
      const data = await fetchJson(
        `/repos/${owner}/${repo}/issues?${params.toString()}`,
      )
      return (data as Array<any>).map((item) => ({
        ...item,
        createdAt: new Date(item.created_at),
        state: normalizeIssueState(item.state),
        user: {
          ...item.user,
          name: item.user?.login || item.user?.name,
          avatarUrl: item.user?.avatar_url || item.user?.avatarUrl,
        },
      }))
    },
  }
}

export const gitee = () => {
  const client = new GiteeClient()
  if (!isEmpty(Config.gitee.proxy)) {
    client.setProxy(Config.gitee.proxy)
  }
  if (!isEmpty(Config.gitee.token)) {
    client.setToken(Config.gitee.token)
  }
  return attachCompatMethods(client)
}

export const gitcode = () => {
  const client = new GitCodeClient()
  if (!isEmpty(Config.gitcode.proxy)) {
    client.setProxy(Config.gitcode.proxy)
  }
  if (!isEmpty(Config.gitcode.token)) {
    client.setToken(Config.gitcode.token)
  }
  return attachCompatMethods(client)
}

export const cnb = () => {
  const client = new CnbClient()
  if (!isEmpty(Config.cnb.proxy)) {
    client.setProxy(Config.cnb.proxy)
  }
  if (!isEmpty(Config.cnb.token)) {
    client.setToken(Config.cnb.token)
  }
  return attachCompatMethods(client)
}
