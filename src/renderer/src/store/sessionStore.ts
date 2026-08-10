import { create } from 'zustand'
import { api, getToken, setToken, type ApiUser } from '../api/client'

interface SessionState {
  user: ApiUser | null
  status: 'unknown' | 'signed-out' | 'signed-in'
  error: string | null
  busy: boolean
  serverOnline: boolean
  presence: Array<{ userId: string; displayName: string }>

  restore: () => Promise<void>
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  setServerOnline: (online: boolean) => void
  setPresence: (userId: string, displayName: string, online: boolean) => void
  clearMustChangePassword: () => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  status: 'unknown',
  error: null,
  busy: false,
  serverOnline: false,
  presence: [],

  /** Reuse a stored token across restarts so a demo doesn't start at the login screen twice. */
  restore: async () => {
    if (!getToken()) {
      set({ status: 'signed-out' })
      return
    }
    try {
      const { user } = await api.me()
      set({ user, status: 'signed-in', error: null })
    } catch {
      setToken(null)
      set({ user: null, status: 'signed-out' })
    }
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null })
    try {
      const { user } = await api.login(email, password)
      set({ user, status: 'signed-in', busy: false })
      return true
    } catch (err) {
      set({ busy: false, error: err instanceof Error ? err.message : 'Sign in failed.' })
      return false
    }
  },

  signOut: async () => {
    await api.logout().catch(() => undefined)
    set({ user: null, status: 'signed-out', presence: [] })
  },

  setServerOnline: (serverOnline) => set({ serverOnline }),

  clearMustChangePassword: () =>
    set((s) => ({ user: s.user ? { ...s.user, mustChangePassword: false } : null })),

  setPresence: (userId, displayName, online) =>
    set(() => {
      const others = get().presence.filter((p) => p.userId !== userId)
      // Never list yourself as "also editing" — it reads as a ghost session.
      const isSelf = get().user?.id === userId
      return { presence: online && !isSelf ? [...others, { userId, displayName }] : others }
    })
}))
