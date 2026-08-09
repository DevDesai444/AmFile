import { create } from 'zustand'

export interface CommentThread {
  id: string
  quotedText: string
  body: string
  authorName: string
  timestamp: string
  resolved: boolean
}

interface CommentState {
  comments: CommentThread[]
  addComment: (comment: CommentThread) => void
  resolveComment: (id: string) => void
  removeComment: (id: string) => void
  onDelete: ((id: string) => void) | null
  registerDeleteHandler: (fn: (id: string) => void) => void
}

export const useCommentStore = create<CommentState>((set, get) => ({
  comments: [],
  onDelete: null,
  addComment: (comment) => set((s) => ({ comments: [...s.comments, comment] })),
  resolveComment: (id) => set((s) => ({ comments: s.comments.map((c) => (c.id === id ? { ...c, resolved: true } : c)) })),
  removeComment: (id) => {
    get().onDelete?.(id)
    set((s) => ({ comments: s.comments.filter((c) => c.id !== id) }))
  },
  registerDeleteHandler: (fn) => set({ onDelete: fn })
}))
