import { Mark, mergeAttributes } from '@tiptap/core'

const authorAttrs = {
  authorId: { default: 'local-user' },
  authorName: { default: 'You' },
  timestamp: { default: () => new Date().toISOString() },
  changeId: { default: () => `c-${Math.random().toString(36).slice(2, 10)}` }
}

/** Text inserted while track changes is on. Kept as a normal mark (not removed on
 *  accept) so accept = strip the mark, reject = delete the range — see
 *  editor/trackChangesPlugin.ts and store/trackChangesStore.ts. Exported to real Word
 *  tracked changes via docx's InsertedTextRun (src/main/services/docx/export.ts). */
export const Insertion = Mark.create({
  name: 'insertion',
  addAttributes() {
    return authorAttrs
  },
  parseHTML() {
    return [{ tag: 'ins' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['ins', mergeAttributes(HTMLAttributes, { class: 'track-insertion' }), 0]
  }
})

/** Text "deleted" while track changes is on. The text stays in the document (struck
 *  through, excluded from word count) until the change is accepted (removes the text)
 *  or rejected (strips the mark). Exported as docx's DeletedTextRun. */
export const Deletion = Mark.create({
  name: 'deletion',
  addAttributes() {
    return authorAttrs
  },
  parseHTML() {
    return [{ tag: 'del' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['del', mergeAttributes(HTMLAttributes, { class: 'track-deletion' }), 0]
  }
})
