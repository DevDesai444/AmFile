import { useCallback, useEffect, useRef } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { api, ApiError } from '../api/client'
import { useDocumentStore } from '../store/documentStore'
import { useServerDocsStore } from '../store/serverDocsStore'
import { useCommentStore } from '../store/commentStore'

/** Renew the lock well inside the server's 90s lease so a slow network doesn't drop it. */
const HEARTBEAT_MS = 30_000

export function useServerDocument(editor: Editor | null): {
  saveToServer: () => Promise<void>
  reloadFromServer: () => Promise<void>
} {
  const documentId = useDocumentStore((s) => s.documentId)
  const revision = useDocumentStore((s) => s.revision)
  const pageSetup = useDocumentStore((s) => s.pageSetup)
  const headerText = useDocumentStore((s) => s.headerText)
  const footerText = useDocumentStore((s) => s.footerText)
  const pendingOpenServerDocId = useDocumentStore((s) => s.pendingOpenServerDocId)
  const clearPendingServerOpen = useDocumentStore((s) => s.clearPendingServerOpen)
  const openServerDocument = useDocumentStore((s) => s.openServerDocument)
  const setRevision = useDocumentStore((s) => s.setRevision)
  const setLockState = useDocumentStore((s) => s.setLockState)
  const markSaved = useDocumentStore((s) => s.markSaved)
  const refreshDocs = useServerDocsStore((s) => s.refresh)
  const clearPendingUpdate = useServerDocsStore((s) => s.clearPendingUpdate)

  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(
    async (id: string) => {
      if (!editor) return
      try {
        const { document } = await api.getDocument(id)
        editor.commands.setContent(document.content as JSONContent)
        const summary = useServerDocsStore.getState().documents.find((d) => d.id === id)
        openServerDocument({ documentId: id, revision: document.revision, title: summary?.path ?? document.documentId })

        // Try to check out. Read-only if someone else holds it — the editor stays usable for
        // reading, but saving will be refused server-side anyway.
        try {
          await api.lock(id)
          setLockState(true, null)
        } catch (err) {
          const holder = err instanceof ApiError ? (err.body as { lockedBy?: string } | null)?.lockedBy : undefined
          setLockState(false, holder ?? 'another user')
        }
        await useCommentStore.getState().loadForDocument(id)
        clearPendingUpdate()
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Could not open that document.')
      }
    },
    [editor, openServerDocument, setLockState, clearPendingUpdate]
  )

  useEffect(() => {
    if (pendingOpenServerDocId && editor) {
      const id = pendingOpenServerDocId
      clearPendingServerOpen()
      void load(id)
    }
  }, [pendingOpenServerDocId, editor, load, clearPendingServerOpen])

  // Hold the lock while the document is open.
  useEffect(() => {
    if (!documentId) return
    heartbeat.current = setInterval(() => {
      void api.heartbeat(documentId).catch(() => undefined)
    }, HEARTBEAT_MS)
    return () => {
      if (heartbeat.current) clearInterval(heartbeat.current)
      // Release on close so the next author isn't blocked for a full lease period.
      void api.unlock(documentId).catch(() => undefined)
    }
  }, [documentId])

  const saveToServer = useCallback(async () => {
    if (!editor || !documentId) return
    try {
      const res = await api.save(documentId, revision, {
        content: editor.getJSON(),
        pageSetup,
        header: headerText ? { text: headerText } : null,
        footer: footerText ? { text: footerText } : null
      })
      setRevision(res.revision)
      markSaved()
      void refreshDocs()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { code?: string; lockedBy?: string; currentRevision?: number } | null
        if (body?.code === 'locked_by_other') {
          window.alert(`Cannot save — ${body.lockedBy} has this document checked out.`)
          setLockState(false, body.lockedBy ?? 'another user')
          return
        }
        if (body?.code === 'stale') {
          window.alert(
            `This document has moved on to revision ${body.currentRevision} since you opened it.\n\nReload it before saving so you don't overwrite someone else's work.`
          )
          return
        }
      }
      window.alert(err instanceof Error ? err.message : 'Save failed.')
    }
  }, [editor, documentId, revision, pageSetup, headerText, footerText, setRevision, markSaved, refreshDocs, setLockState])

  const reloadFromServer = useCallback(async () => {
    if (documentId) await load(documentId)
  }, [documentId, load])

  return { saveToServer, reloadFromServer }
}
