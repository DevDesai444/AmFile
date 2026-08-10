/**
 * GitHub as the backend.
 *
 * There is no AmFile server in this path: the desktop app talks to api.github.com directly with
 * the signed-in user's token. That is what makes a second machine need nothing but the app and
 * a GitHub account — no address to configure, no port to open, no database to reach.
 *
 * How AmFile concepts map:
 *
 *   project           a private repository, tagged with the `amfile-project` topic
 *   folder            a directory inside that repository
 *   document          a JSON file holding the editor's document model
 *   revision          a commit
 *   proposal          a branch plus a pull request
 *   accept / close    merge / close the pull request
 *   discussion        pull request comments
 *   who has access    repository collaborators
 *
 * The topic is the marker that separates AmFile projects from a user's other repositories, so
 * listing projects never shows unrelated work.
 */

const API = 'https://api.github.com'
export const PROJECT_TOPIC = 'amfile-project'

let token: string | null = null

export function setToken(value: string | null): void {
  token = value
}

export function hasToken(): boolean {
  return token !== null
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!token) throw new GitHubError('Not signed in to GitHub.', 401)

  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  })

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // GitHub puts the useful part in `message`, and validation detail in `errors`.
    const detail = (body as { message?: string; errors?: Array<{ message?: string }> } | null) ?? {}
    const extra = detail.errors?.map((e) => e.message).filter(Boolean).join('; ')
    throw new GitHubError(
      [detail.message ?? `GitHub request failed (${res.status})`, extra].filter(Boolean).join(' — '),
      res.status
    )
  }
  return body as T
}

// ----------------------------------------------------------------------------------- identity

export interface GitHubUser {
  login: string
  name: string | null
  email: string | null
  avatarUrl: string | null
}

export async function currentUser(): Promise<GitHubUser> {
  const me = await gh<{ login: string; name: string | null; email: string | null; avatar_url: string | null }>(
    '/user'
  )
  // /user omits the address when the profile hides it, so fall back to the verified primary.
  let email = me.email
  if (!email) {
    const emails = await gh<Array<{ email: string; primary: boolean; verified: boolean }>>('/user/emails').catch(
      () => []
    )
    email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? null
  }
  return { login: me.login, name: me.name, email, avatarUrl: me.avatar_url }
}

// ----------------------------------------------------------------------------------- projects

export interface Project {
  /** owner/name — the identifier everything else is addressed by. */
  fullName: string
  owner: string
  name: string
  /** What the user typed when creating it; the repo name is a slug of this. */
  title: string
  private: boolean
  /** True when the signed-in user can change settings and merge — i.e. is an owner. */
  admin: boolean
  pushable: boolean
  defaultBranch: string
  updatedAt: string
}

interface RepoPayload {
  full_name: string
  name: string
  owner: { login: string }
  description: string | null
  private: boolean
  topics?: string[]
  permissions?: { admin?: boolean; push?: boolean }
  default_branch: string
  updated_at: string
}

function toProject(r: RepoPayload): Project {
  return {
    fullName: r.full_name,
    owner: r.owner.login,
    name: r.name,
    title: r.description || r.name,
    private: r.private,
    admin: Boolean(r.permissions?.admin),
    pushable: Boolean(r.permissions?.push),
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at
  }
}

/**
 * Every AmFile project this account can reach — owned and shared alike.
 *
 * Listing repositories and filtering on the topic rather than using the search API: search is
 * limited to 30 requests a minute and lags behind newly created repositories, which would make
 * a project vanish for a minute right after someone created it.
 */
export async function listProjects(): Promise<Project[]> {
  const repos = await gh<RepoPayload[]>('/user/repos?per_page=100&affiliation=owner,collaborator&sort=updated')
  return repos.filter((r) => r.topics?.includes(PROJECT_TOPIC)).map(toProject)
}

/** Repository names are restricted; the title the user typed is kept in the description. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 90)
  return slug || 'amfile-project'
}

/**
 * Create a project: a private repository, tagged, with an initial commit so it has a branch to
 * write to. A repository with no commits has no default branch, and every later write would
 * fail with a confusing 404.
 */
export async function createProject(title: string): Promise<Project> {
  const repo = await gh<RepoPayload>('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: slugify(title),
      description: title,
      private: true,
      auto_init: true,
      has_issues: false,
      has_wiki: false,
      has_projects: false
    })
  })

  await gh(`/repos/${repo.full_name}/topics`, {
    method: 'PUT',
    body: JSON.stringify({ names: [PROJECT_TOPIC] })
  })

  return toProject({ ...repo, topics: [PROJECT_TOPIC], permissions: { admin: true, push: true } })
}

// -------------------------------------------------------------------------- folders and files

export interface Entry {
  path: string
  name: string
  type: 'dir' | 'file'
  sha: string
}

/** One directory listing. `path` empty means the root of the project. */
export async function listDirectory(fullName: string, path = '', ref?: string): Promise<Entry[]> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const items = await gh<Array<{ path: string; name: string; type: string; sha: string }>>(
    `/repos/${fullName}/contents/${encodeURI(path)}${query}`
  ).catch((err) => {
    // An empty directory does not exist in git, so "not found" here means "nothing in it".
    if (err instanceof GitHubError && err.status === 404) return []
    throw err
  })
  return items
    .filter((i) => i.type === 'dir' || i.type === 'file')
    .map((i) => ({ path: i.path, name: i.name, type: i.type as 'dir' | 'file', sha: i.sha }))
}

/**
 * The whole project tree in one request.
 *
 * `git/trees?recursive=1` costs one call where walking directories costs one per folder, which
 * matters against a 5000-per-hour budget shared with everything else the app does.
 */
export async function projectTree(
  fullName: string,
  ref: string
): Promise<{ entries: Entry[]; truncated: boolean }> {
  const tree = await gh<{
    truncated: boolean
    tree: Array<{ path: string; type: string; sha: string }>
  }>(`/repos/${fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`)

  return {
    truncated: tree.truncated,
    entries: tree.tree
      .filter((t) => t.type === 'tree' || t.type === 'blob')
      .map((t) => ({
        path: t.path,
        name: t.path.split('/').pop() ?? t.path,
        type: t.type === 'tree' ? ('dir' as const) : ('file' as const),
        sha: t.sha
      }))
  }
}

export interface FileContent<T = unknown> {
  content: T
  /** Needed to update the file; GitHub rejects a write that does not name the blob it replaces. */
  sha: string
}

export async function readJson<T>(fullName: string, path: string, ref?: string): Promise<FileContent<T> | null> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const file = await gh<{ content: string; encoding: string; sha: string }>(
    `/repos/${fullName}/contents/${encodeURI(path)}${query}`
  ).catch((err) => {
    if (err instanceof GitHubError && err.status === 404) return null
    throw err
  })
  if (!file) return null
  const text = decodeBase64(file.content)
  return { content: JSON.parse(text) as T, sha: file.sha }
}

/** Create or replace a file. Omit `sha` to create; pass the previous blob's sha to update. */
export async function writeJson(
  fullName: string,
  path: string,
  value: unknown,
  message: string,
  opts: { sha?: string; branch?: string } = {}
): Promise<{ sha: string; commit: string }> {
  const res = await gh<{ content: { sha: string }; commit: { sha: string } }>(
    `/repos/${fullName}/contents/${encodeURI(path)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: encodeBase64(JSON.stringify(value, null, 2)),
        ...(opts.sha ? { sha: opts.sha } : {}),
        ...(opts.branch ? { branch: opts.branch } : {})
      })
    }
  )
  return { sha: res.content.sha, commit: res.commit.sha }
}

/**
 * Git has no empty directories, so a folder only exists once it contains something. A marker
 * file gives a newly created folder somewhere to live until a document is put in it.
 */
export async function createFolder(fullName: string, path: string, branch?: string): Promise<void> {
  await writeJson(fullName, `${path}/.amfile-folder`, { created: true }, `Add folder ${path}`, { branch })
}

// ---------------------------------------------------------------------------------- proposals

export interface Proposal {
  number: number
  title: string
  body: string | null
  author: string
  branch: string
  state: 'open' | 'closed'
  merged: boolean
  createdAt: string
  updatedAt: string
  commentCount: number
}

function toProposal(p: {
  number: number
  title: string
  body: string | null
  user: { login: string } | null
  head: { ref: string }
  state: string
  merged_at: string | null
  created_at: string
  updated_at: string
  comments?: number
}): Proposal {
  return {
    number: p.number,
    title: p.title,
    body: p.body,
    author: p.user?.login ?? 'unknown',
    branch: p.head.ref,
    state: p.state === 'open' ? 'open' : 'closed',
    merged: p.merged_at !== null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    commentCount: p.comments ?? 0
  }
}

export async function listProposals(fullName: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<Proposal[]> {
  const pulls = await gh<Parameters<typeof toProposal>[0][]>(
    `/repos/${fullName}/pulls?state=${state}&per_page=50&sort=updated&direction=desc`
  )
  return pulls.map(toProposal)
}

/** Branch off the current tip of `base`. */
export async function createBranch(fullName: string, branch: string, base: string): Promise<void> {
  const ref = await gh<{ object: { sha: string } }>(`/repos/${fullName}/git/ref/heads/${encodeURIComponent(base)}`)
  await gh(`/repos/${fullName}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha })
  })
}

export async function openProposal(
  fullName: string,
  opts: { title: string; body?: string; branch: string; base: string }
): Promise<Proposal> {
  const pr = await gh<Parameters<typeof toProposal>[0]>(`/repos/${fullName}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title: opts.title, body: opts.body ?? '', head: opts.branch, base: opts.base })
  })
  return toProposal(pr)
}

/**
 * Accept a proposal.
 *
 * Squashed deliberately: one accepted proposal becomes one commit on the main branch, so the
 * revision history an analyst sees matches the reviews that produced it rather than every
 * intermediate save the author made along the way.
 */
export async function acceptProposal(fullName: string, number: number, reason?: string): Promise<string> {
  const res = await gh<{ sha: string }>(`/repos/${fullName}/pulls/${number}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ merge_method: 'squash', ...(reason ? { commit_message: reason } : {}) })
  })
  return res.sha
}

export async function closeProposal(fullName: string, number: number): Promise<void> {
  await gh(`/repos/${fullName}/pulls/${number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) })
}

/** Commit history for one file — who changed a document, and when. */
export async function commitsFor(
  fullName: string,
  path: string
): Promise<Array<{ sha: string; author: string; date: string; message: string }>> {
  const commits = await gh<
    Array<{
      sha: string
      commit: { message: string; author: { name: string; date: string } | null }
      author: { login: string } | null
    }>
  >(`/repos/${fullName}/commits?path=${encodeURIComponent(path)}&per_page=100`).catch((err) => {
    if (err instanceof GitHubError && err.status === 404) return []
    throw err
  })
  return commits.map((c) => ({
    sha: c.sha,
    author: c.author?.login ?? c.commit.author?.name ?? 'unknown',
    date: c.commit.author?.date ?? '',
    message: c.commit.message.split('\n')[0]
  }))
}

// --------------------------------------------------------------------------------- discussion

export interface Comment {
  id: number
  author: string
  body: string
  createdAt: string
}

export async function listComments(fullName: string, number: number): Promise<Comment[]> {
  // Pull request conversation lives on the issues endpoint; /pulls/comments is line-level review.
  const comments = await gh<Array<{ id: number; user: { login: string } | null; body: string; created_at: string }>>(
    `/repos/${fullName}/issues/${number}/comments?per_page=100`
  )
  return comments.map((c) => ({
    id: c.id,
    author: c.user?.login ?? 'unknown',
    body: c.body,
    createdAt: c.created_at
  }))
}

export async function addComment(fullName: string, number: number, body: string): Promise<void> {
  await gh(`/repos/${fullName}/issues/${number}/comments`, { method: 'POST', body: JSON.stringify({ body }) })
}

// -------------------------------------------------------------------------------------- people

export interface Collaborator {
  login: string
  name: string | null
  avatarUrl: string | null
  access: 'read' | 'write' | 'admin'
}

/**
 * The Amneal convention: `name.surname@amneal.com` is held by the GitHub account
 * `NameSurnameAm` — each part of the address capitalised, joined, with `Am` appended.
 *
 * This is what makes "add someone by their work email" possible at all. GitHub's collaborator
 * API addresses people by login and there is no way to look a login up from an email, because
 * user search only indexes addresses people have deliberately made public. A naming convention
 * sidesteps that: the login is derived, not discovered.
 *
 * Returns null when the address is not an Amneal one, since the convention says nothing about
 * outside addresses and guessing a login for a stranger is exactly what must not happen.
 */
export function usernameFromEmail(email: string): string | null {
  const match = email.trim().toLowerCase().match(/^([^@]+)@amneal\.com$/)
  if (!match) return null

  const parts = match[1].split(/[._-]+/).filter(Boolean)
  if (parts.length === 0) return null

  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('') + 'Am'
}

/**
 * Who a login actually belongs to, or null if nobody holds it.
 *
 * Called before every invitation. A derived login is a guess, and a wrong guess would invite a
 * stranger into a private repository of submission data — so the account is resolved and shown
 * to the person doing the inviting, who confirms it is their colleague, rather than the
 * invitation going out on the strength of a string match.
 */
export async function lookupUser(login: string): Promise<GitHubUser | null> {
  const user = await gh<{ login: string; name: string | null; email: string | null; avatar_url: string | null }>(
    `/users/${encodeURIComponent(login)}`
  ).catch((err) => {
    if (err instanceof GitHubError && err.status === 404) return null
    throw err
  })
  if (!user) return null
  return { login: user.login, name: user.name, email: user.email, avatarUrl: user.avatar_url }
}

/**
 * Resolve what someone typed — an Amneal email or a GitHub login — to a real account.
 *
 * The caller is expected to show `user` and get a yes before calling addCollaborator.
 */
export async function resolvePerson(
  input: string
): Promise<
  | { ok: true; user: GitHubUser; derivedFrom: 'email' | 'login' }
  | { ok: false; reason: string; expectedLogin?: string }
> {
  const typed = input.trim()
  if (!typed) return { ok: false, reason: 'Enter an Amneal email address or a GitHub username.' }

  if (typed.includes('@')) {
    const login = usernameFromEmail(typed)
    if (!login) {
      return {
        ok: false,
        reason: 'Only @amneal.com addresses can be resolved to an account. Enter their GitHub username instead.'
      }
    }
    const user = await lookupUser(login)
    if (!user) {
      return {
        ok: false,
        expectedLogin: login,
        reason: `No GitHub account named ${login}. Ask them to create one at github.com/signup using exactly that username, then add them again.`
      }
    }
    return { ok: true, user, derivedFrom: 'email' }
  }

  const user = await lookupUser(typed)
  if (!user) return { ok: false, reason: `No GitHub account named ${typed}.` }
  return { ok: true, user, derivedFrom: 'login' }
}

export async function listCollaborators(fullName: string): Promise<Collaborator[]> {
  const people = await gh<
    Array<{ login: string; avatar_url: string | null; permissions?: { admin?: boolean; push?: boolean } }>
  >(`/repos/${fullName}/collaborators?per_page=100`)
  return people.map((p) => ({
    login: p.login,
    name: null,
    avatarUrl: p.avatar_url,
    access: p.permissions?.admin ? 'admin' : p.permissions?.push ? 'write' : 'read'
  }))
}

/**
 * Invite someone to a project.
 *
 * By GitHub username, not email — and that is a real constraint rather than a shortcut. The
 * collaborator API addresses people by login, and an email cannot be resolved to a login
 * because GitHub's user search only indexes addresses people have chosen to make public, which
 * most have not. Email invitations exist only for organisation repositories
 * (`POST /orgs/{org}/invitations`), so moving projects into an Amneal organisation is what
 * would make "add by email" work.
 */
export async function addCollaborator(
  fullName: string,
  login: string,
  access: 'read' | 'write' | 'admin' = 'write'
): Promise<{ invited: boolean }> {
  // 201 means an invitation was created; 204 means they already had access.
  const result = await gh<{ id?: number } | undefined>(
    `/repos/${fullName}/collaborators/${encodeURIComponent(login)}`,
    { method: 'PUT', body: JSON.stringify({ permission: access }) }
  )
  return { invited: Boolean(result?.id) }
}

export async function removeCollaborator(fullName: string, login: string): Promise<void> {
  await gh(`/repos/${fullName}/collaborators/${encodeURIComponent(login)}`, { method: 'DELETE' })
}

/** Invitations that have been sent but not yet accepted — pending access, not access. */
export async function listPendingInvites(
  fullName: string
): Promise<Array<{ id: number; login: string; access: string }>> {
  const invites = await gh<Array<{ id: number; invitee: { login: string } | null; permissions: string }>>(
    `/repos/${fullName}/invitations`
  )
  return invites.map((i) => ({ id: i.id, login: i.invitee?.login ?? 'unknown', access: i.permissions }))
}

// -------------------------------------------------------------------------------------- base64

/** btoa cannot take characters above U+00FF, and document text is full of them. */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
