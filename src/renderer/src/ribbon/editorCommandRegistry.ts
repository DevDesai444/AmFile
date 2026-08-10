/**
 * Ribbon buttons need to call into whichever Tiptap editor instance is currently
 * mounted (the main document editor, or a header/footer mini-editor), but the ribbon
 * itself is rendered outside the editor tree. The mounted editor registers its command
 * handler here on focus; ribbonActions looks it up by id instead of importing the editor
 * directly, keeping the ribbon config decoupled from any one editor instance.
 */
export type EditorCommandHandler = (command: string, payload?: unknown) => void

const handlers = new Map<string, EditorCommandHandler>()
let activeId = 'main'

export function registerEditorCommandHandler(id: string, handler: EditorCommandHandler): () => void {
  handlers.set(id, handler)
  return () => {
    handlers.delete(id)
  }
}

export function setActiveEditor(id: string): void {
  activeId = id
}

/** Returns false when no editor is mounted, so the caller can explain why nothing happened. */
export function runEditorCommand(command: string, payload?: unknown): boolean {
  const handler = handlers.get(activeId) ?? handlers.get('main')
  if (!handler) {
    console.info(`[editor] no active editor to run "${command}"`)
    return false
  }
  handler(command, payload)
  return true
}
