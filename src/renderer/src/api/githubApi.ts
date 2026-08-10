/**
 * The AmFile API surface, backed by GitHub instead of a server.
 *
 * Deliberately the same shape as the old HTTP client so the stores, panels and editor need no
 * changes: swapping the export in `client.ts` swaps the entire backend.
 *
 * Identifiers carry their own location, since there is no database to look anything up in:
 *
 *   project / top folder   "owner/repo"
 *   sub-folder             "owner/repo:path/to/folder"
 *   document               "owner/repo:path/to/doc.amdoc.json"
 *   proposal               "owner/repo#42"
 *
 * A document is one JSON file holding the editor model, its page setup and its comments, so a
 * save is a single commit and a review is a diff of one file.
 */
import * as gh from '../github/client'
import type { ApiDocument, ApiFolderNode, ApiRevision, ApiUser, FolderMember, PendingInvite, Proposal } from './client'

export const DOC_SUFFIX = '.amdoc.json'

/** An anchored comment, stored in the document file alongside the text it points at. */
export interface StoredComment {
  id: string
  markId: string
  quotedText: string
  body: string
  authorName: string
  createdAt: string
  resolvedAt: string | null
}

/** The on-disk shape of a document. `amfile` guards against reading some other JSON file. */
export interface StoredDocument {
  amfile: 1
  title: string
  revision: number
  content: unknown
  pageSetup: unknown
  header: unknown
  footer: unknown
  comments: StoredComment[]
  updatedAt: string
  updatedBy: string
}

function emptyDocument(title: string, author: string): StoredDocument {
  return {
    amfile: 1,
    title,
    revision: 1,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    pageSetup: null,
    header: null,
    footer: null,
    comments: [],
    updatedAt: new Date().toISOString(),
    updatedBy: author
  }
}

// ------------------------------------------------------------------------------- identifiers

export function splitId(id: string): { repo: string; path: string } {
  const at = id.indexOf(':')
  return at === -1 ? { repo: id, path: '' } : { repo: id.slice(0, at), path: id.slice(at + 1) }
}

export function proposalId(repo: string, number: number): string {
  return `${repo}#${number}`
}

function splitProposalId(id: string): { repo: string; number: number } {
  const hash = id.lastIndexOf('#')
  return { repo: id.slice(0, hash), number: Number(id.slice(hash + 1)) }
}

/** GitHub repository permissions, in AmFile's vocabulary. */
function accessOf(p: gh.Project): 'viewer' | 'editor' | 'owner' {
  return p.admin ? 'owner' : p.pushable ? 'editor' : 'viewer'
}

// ------------------------------------------------------------------------------------ session

let me: gh.GitHubUser | null = null

export function currentLogin(): string {
  return me?.login ?? 'unknown'
}

function asApiUser(u: gh.GitHubUser): ApiUser {
  return {
    id: u.login,
    email: u.email ?? `${u.login}@users.noreply.github.com`,
    displayName: u.name?.trim() || u.login,
    mustChangePassword: false
  }
}

// -------------------------------------------------------------------------------------- tree

/**
 * The project tree.
 *
 * One `git/trees?recursive=1` call per project rather than a request per directory — against a
 * 5000-per-hour budget shared with saving and reviewing, walking folder by folder would be the
 * thing that runs the account out of requests.
 */
async function treeForProject(project: gh.Project): Promise<ApiFolderNode> {
  const access = accessOf(project)
  const root: ApiFolderNode = {
    id: project.fullName,
    name: project.title,
    parentId: null,
    access,
    children: [],
    documents: []
  }

  const byPath = new Map<string, ApiFolderNode>([['', root]])

  const { entries } = await gh.projectTree(project.fullName, project.defaultBranch).catch(() => ({ entries: [] }))

  // Directories first and shallowest-first, so a child always finds its parent already built.
  const dirs = entries.filter((e) => e.type === 'dir').sort((a, b) => a.path.split('/').length - b.path.split('/').length)
  for (const dir of dirs) {
    const parentPath = dir.path.includes('/') ? dir.path.slice(0, dir.path.lastIndexOf('/')) : ''
    const parent = byPath.get(parentPath) ?? root
    const node: ApiFolderNode = {
      id: `${project.fullName}:${dir.path}`,
      name: dir.name,
      parentId: parent.id,
      access,
      children: [],
      documents: []
    }
    byPath.set(dir.path, node)
    parent.children.push(node)
  }

  for (const file of entries) {
    if (file.type !== 'file' || !file.path.endsWith(DOC_SUFFIX)) continue
    const dirPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
    const parent = byPath.get(dirPath) ?? root
    // currentRevision is filled in when the document is opened: reading every file here to
    // learn its revision would be one API call per document on every tree refresh.
    parent.documents.push({
      id: `${project.fullName}:${file.path}`,
      path: file.name.replace(DOC_SUFFIX, '.docx'),
      title: file.name.replace(DOC_SUFFIX, ''),
      currentRevision: 0,
      updatedAt: null,
      lockedBy: null
    })
  }

  return root
}

// --------------------------------------------------------------------------------------- api

export const githubApi = {
  // ----- session ---------------------------------------------------------------------------
  async login(): Promise<{ user: ApiUser; passwordExpired: boolean }> {
    throw new Error('AmFile signs in with GitHub. There are no passwords.')
  },

  async logout(): Promise<void> {
    await window.amfile?.github?.signOut()
    gh.setToken(null)
    me = null
  },

  /** Adopt a token — from the device flow, or the one kept from a previous session. */
  async adoptToken(token: string): Promise<ApiUser> {
    gh.setToken(token)
    me = await gh.currentUser()
    return asApiUser(me)
  },

  async me(): Promise<{ user: ApiUser }> {
    if (!me) {
      if (!gh.hasToken()) throw new Error('Not signed in')
      me = await gh.currentUser()
    }
    return { user: asApiUser(me) }
  },

  async authMethods(): Promise<{ github: boolean; password: boolean }> {
    return { github: (await window.amfile?.github?.isConfigured()) ?? false, password: false }
  },

  async changePassword(): Promise<{ ok: true }> {
    throw new Error('AmFile has no passwords — your GitHub account is your sign-in.')
  },

  // ----- projects and folders --------------------------------------------------------------
  async listFolders(): Promise<{ folders: ApiFolderNode[] }> {
    const projects = await gh.listProjects()
    return { folders: await Promise.all(projects.map(treeForProject)) }
  },

  async createFolder(name: string, parentId: string | null): Promise<{ id: string }> {
    if (!parentId) {
      const project = await gh.createProject(name)
      return { id: project.fullName }
    }
    const { repo, path } = splitId(parentId)
    const folderPath = path ? `${path}/${name}` : name
    await gh.createFolder(repo, folderPath)
    return { id: `${repo}:${folderPath}` }
  },

  // ----- documents -------------------------------------------------------------------------
  async listDocuments(): Promise<{ documents: ApiDocument[] }> {
    const { folders } = await githubApi.listFolders()
    const out: ApiDocument[] = []
    // A folder node's document carries no lock lease, and ApiDocument's does; nothing is ever
    // locked here, so the field is simply null.
    const walk = (n: ApiFolderNode): void => {
      out.push(...n.documents.map((d) => ({ ...d, lockedBy: null })))
      n.children.forEach(walk)
    }
    folders.forEach(walk)
    return { documents: out }
  },

  async createDocument(path: string, title: string, folderId: string): Promise<{ document: ApiDocument }> {
    const { repo, path: dir } = splitId(folderId)
    const file = `${dir ? `${dir}/` : ''}${title}${DOC_SUFFIX}`
    await gh.writeJson(repo, file, emptyDocument(title, currentLogin()), `Create ${title}`)
    return {
      document: {
        id: `${repo}:${file}`,
        path,
        title,
        currentRevision: 1,
        updatedAt: new Date().toISOString(),
        lockedBy: null
      }
    }
  },

  async getDocument(id: string, ref?: string): Promise<{ document: ApiRevision }> {
    const { repo, path } = splitId(id)
    const file = await gh.readJson<StoredDocument>(repo, path, ref)
    if (!file) throw new Error('That document no longer exists in the project.')
    const d = file.content
    return {
      document: {
        documentId: id,
        revision: d.revision,
        content: d.content,
        pageSetup: d.pageSetup,
        header: d.header,
        footer: d.footer,
        contentHash: file.sha,
        authorName: d.updatedBy,
        createdAt: d.updatedAt
      }
    }
  },

  /**
   * Save straight to the project's default branch.
   *
   * Used when you own the project. Everyone else's saves go through `saveProposal`, which is
   * what puts a change in front of a reviewer.
   */
  async save(id: string, payload: { content: unknown; pageSetup?: unknown; header?: unknown; footer?: unknown; summary?: string | null }): Promise<{ revision: number }> {
    const { repo, path } = splitId(id)
    const existing = await gh.readJson<StoredDocument>(repo, path)
    if (!existing) throw new Error('That document no longer exists in the project.')

    const next: StoredDocument = {
      ...existing.content,
      content: payload.content,
      pageSetup: payload.pageSetup ?? existing.content.pageSetup,
      header: payload.header ?? existing.content.header,
      footer: payload.footer ?? existing.content.footer,
      revision: existing.content.revision + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: currentLogin()
    }
    await gh.writeJson(repo, path, next, payload.summary?.trim() || `Update ${existing.content.title}`, {
      sha: existing.sha
    })
    return { revision: next.revision }
  },

  /** Commit history for one document — the record of who changed what, and when. */
  async history(id: string): Promise<{ history: Array<{ revision: number; authorName: string; createdAt: string; summary: string | null }> }> {
    const { repo, path } = splitId(id)
    const commits = await gh.commitsFor(repo, path)
    return {
      history: commits.map((c, i) => ({
        revision: commits.length - i,
        authorName: c.author,
        createdAt: c.date,
        summary: c.message
      }))
    }
  },

  // ----- locks: no longer a concept ----------------------------------------------------------
  // Check-out locking was replaced by proposals. These stay so the editor's existing calls are
  // harmless no-ops rather than errors.
  async lock(): Promise<{ ok: true }> {
    return { ok: true }
  },
  async unlock(): Promise<{ ok: true }> {
    return { ok: true }
  },
  async heartbeat(): Promise<{ held: boolean }> {
    return { held: true }
  },

  // ----- proposals ---------------------------------------------------------------------------
  async listProposals(documentId: string): Promise<{ proposals: Proposal[] }> {
    const { repo, path } = splitId(documentId)
    const pulls = await gh.listProposals(repo, 'all')
    return {
      proposals: pulls
        // The branch name records which document the proposal is about.
        .filter((p) => p.branch.startsWith('amfile/') && p.body?.includes(path))
        .map((p) => ({
          id: proposalId(repo, p.number),
          documentId,
          authorId: p.author,
          authorName: p.author,
          baseRevision: 0,
          summary: p.title,
          status: p.merged ? ('accepted' as const) : p.state === 'open' ? ('open' as const) : ('closed' as const),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          resolvedByName: null,
          resultingRevision: null,
          // Whether the document moved on under a proposal is answered by GitHub's own
          // mergeability check at review time, not guessed from a revision number here.
          stale: false,
          commentCount: p.commentCount
        }))
    }
  },

  /**
   * Propose a change: a branch, a commit on it, and a pull request.
   *
   * Reuses an open proposal by the same author on the same document rather than opening a
   * second one, so an author saving three times leaves one review to do, not three.
   */
  async saveProposal(documentId: string, content: unknown, summary: string | null): Promise<{ id: string; created: boolean }> {
    const { repo, path } = splitId(documentId)
    const projects = await gh.listProjects()
    const project = projects.find((p) => p.fullName === repo)
    if (!project) throw new Error('You no longer have access to that project.')

    const mine = (await gh.listProposals(repo, 'open')).find(
      (p) => p.author === currentLogin() && p.body?.includes(path)
    )

    const branch = mine?.branch ?? `amfile/${currentLogin()}/${Date.now().toString(36)}`
    if (!mine) await gh.createBranch(repo, branch, project.defaultBranch)

    const existing = await gh.readJson<StoredDocument>(repo, path, branch)
    if (!existing) throw new Error('That document no longer exists in the project.')

    await gh.writeJson(
      repo,
      path,
      {
        ...existing.content,
        content,
        revision: existing.content.revision + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: currentLogin()
      },
      summary?.trim() || `Update ${existing.content.title}`,
      { sha: existing.sha, branch }
    )

    if (mine) return { id: proposalId(repo, mine.number), created: false }

    const pr = await gh.openProposal(repo, {
      title: summary?.trim() || `Changes to ${existing.content.title}`,
      // The path is in the body because that is what identifies which document this is about.
      body: `AmFile proposal for \`${path}\``,
      branch,
      base: project.defaultBranch
    })
    return { id: proposalId(repo, pr.number), created: true }
  },

  async acceptProposal(id: string, reason: string | null): Promise<{ ok: true; revision: number }> {
    const { repo, number } = splitProposalId(id)
    await gh.acceptProposal(repo, number, reason ?? undefined)
    return { ok: true, revision: 0 }
  },

  async closeProposal(id: string): Promise<{ ok: true }> {
    const { repo, number } = splitProposalId(id)
    await gh.closeProposal(repo, number)
    return { ok: true }
  },

  async proposalComments(id: string): Promise<{ comments: Array<{ id: string; authorName: string; body: string; createdAt: string }> }> {
    const { repo, number } = splitProposalId(id)
    const comments = await gh.listComments(repo, number)
    return {
      comments: comments.map((c) => ({
        id: String(c.id),
        authorName: c.author,
        body: c.body,
        createdAt: c.createdAt
      }))
    }
  },

  async addProposalComment(id: string, body: string): Promise<{ ok: true }> {
    const { repo, number } = splitProposalId(id)
    await gh.addComment(repo, number, body)
    return { ok: true }
  },

  // ----- people --------------------------------------------------------------------------------
  async folderMembers(folderId: string): Promise<{ members: FolderMember[] }> {
    const { repo } = splitId(folderId)
    const people = await gh.listCollaborators(repo)
    return {
      members: people.map((p) => ({
        userId: p.login,
        displayName: p.name ?? p.login,
        email: p.login,
        access: p.access === 'admin' ? ('owner' as const) : p.access === 'write' ? ('editor' as const) : ('viewer' as const),
        inherited: false
      }))
    }
  },

  async folderInvites(folderId: string): Promise<{ invites: PendingInvite[] }> {
    const { repo } = splitId(folderId)
    const invites = await gh.listPendingInvites(repo)
    return {
      invites: invites.map((i) => ({
        email: i.login,
        access: i.access === 'admin' ? ('owner' as const) : i.access === 'write' ? ('editor' as const) : ('viewer' as const),
        invitedAt: ''
      }))
    }
  },

  /**
   * Add someone by Amneal email or GitHub username.
   *
   * The email is turned into a username by the Amneal convention
   * (name.surname@amneal.com -> NameSurnameAm) because GitHub cannot look a private address up.
   */
  async inviteToFolder(folderId: string, who: string, access: 'viewer' | 'editor' | 'owner'): Promise<{ ok: true; immediate: boolean }> {
    const { repo } = splitId(folderId)
    const resolved = await gh.resolvePerson(who)
    if (!resolved.ok) throw new Error(resolved.reason)

    const permission = access === 'owner' ? 'admin' : access === 'editor' ? 'write' : 'read'
    const { invited } = await gh.addCollaborator(repo, resolved.user.login, permission)
    return { ok: true, immediate: !invited }
  },

  async setFolderAccess(folderId: string, login: string, access: 'viewer' | 'editor' | 'owner' | null): Promise<{ ok: true }> {
    const { repo } = splitId(folderId)
    if (access === null) await gh.removeCollaborator(repo, login)
    else await gh.addCollaborator(repo, login, access === 'owner' ? 'admin' : access === 'editor' ? 'write' : 'read')
    return { ok: true }
  },

  async revokeInvite(folderId: string, login: string): Promise<{ ok: true }> {
    const { repo } = splitId(folderId)
    await gh.removeCollaborator(repo, login)
    return { ok: true }
  }
}

export type GithubApi = typeof githubApi
