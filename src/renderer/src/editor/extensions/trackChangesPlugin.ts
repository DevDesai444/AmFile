import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { useDocumentStore } from '../../store/documentStore'

const trackChangesPluginKey = new PluginKey('trackChanges')
const INTERNAL_META = 'trackChangesInternal'

function isTrackingOn(): boolean {
  return useDocumentStore.getState().trackChangesEnabled
}

/**
 * Hand-rolled track changes (per the plan: no unmaintained community package, and this
 * is simpler than it looks since we're recording live edit operations, not diffing two
 * arbitrary documents). Two parts:
 *  - Backspace/Delete keyboard shortcuts: when tracking is on, mark the character about to
 *    be removed with the `deletion` mark instead of deleting it, and move the cursor past it.
 *  - appendTransaction: after any transaction that inserted plain text (typing, paste, IME),
 *    mark the newly inserted range with the `insertion` mark.
 * Known simplification: replacing a multi-character selection by typing over it deletes the
 * selection outright rather than marking it — covers the common single-character-at-a-time
 * editing pattern, not every possible edit shape. Documented as a known gap.
 */
export const TrackChangesPlugin = Extension.create({
  name: 'trackChangesPlugin',

  addKeyboardShortcuts() {
    const markDeletion = (direction: 'backward' | 'forward') =>
      (): boolean => {
        if (!isTrackingOn()) return false
        const { state, view } = this.editor
        const { selection } = state
        if (!selection.empty) return false

        const from = direction === 'backward' ? selection.from - 1 : selection.from
        const to = direction === 'backward' ? selection.from : selection.from + 1
        if (from < 0 || to > state.doc.content.size) return false

        const tr = state.tr
        tr.setMeta(INTERNAL_META, true)
        tr.addMark(from, to, state.schema.marks.deletion.create({}))
        if (direction === 'backward') tr.setSelection(TextSelection.near(tr.doc.resolve(from)))
        view.dispatch(tr)
        return true
      }

    return {
      Backspace: markDeletion('backward'),
      Delete: markDeletion('forward')
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: trackChangesPluginKey,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!isTrackingOn()) return null
          const relevant = transactions.find((tr) => tr.docChanged && !tr.getMeta(INTERNAL_META))
          if (!relevant) return null

          const tr = newState.tr
          let changed = false
          relevant.mapping.maps.forEach((stepMap) => {
            stepMap.forEach((_fromA, _toA, fromB, toB) => {
              if (toB > fromB) {
                tr.addMark(fromB, toB, newState.schema.marks.insertion.create({}))
                changed = true
              }
            })
          })
          if (!changed) return null
          tr.setMeta(INTERNAL_META, true)
          return tr
        }
      })
    ]
  }
})
