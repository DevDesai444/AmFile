import { useUiStore } from '../store/uiStore'
import { useDocumentStore } from '../store/documentStore'
import { useTreeStore } from '../store/treeStore'
import { runEditorCommand } from './editorCommandRegistry'

const EDITOR_COMMAND_PREFIXES = ['mark.', 'font.', 'align.', 'list.', 'paragraph.', 'style.', 'insert.', 'edit.', 'track.']

export async function runRibbonAction(act: string): Promise<void> {
  const ui = useUiStore.getState()
  const doc = useDocumentStore.getState()
  const tree = useTreeStore.getState()

  switch (act) {
    case 'noop':
      return

    case 'file.new':
      if (doc.dirty && !window.confirm('You have unsaved changes. Discard them and start a new document?')) {
        return
      }
      doc.newDocument('Untitled document.docx')
      ui.setView('editor')
      return

    case 'file.save':
      runEditorCommand('save')
      return

    case 'file.print':
      runEditorCommand('print')
      return

    case 'file.open':
    case 'folder.open': {
      if (!window.amfile) return
      const rootPath = await window.amfile.fs.openFolderDialog()
      if (!rootPath) return
      await tree.openRoot(rootPath)
      ui.setView(ui.view === 'welcome' ? 'welcome' : ui.view)
      return
    }

    case 'app.settings':
      ui.setView('settings')
      return

    case 'compliance.checkDocument':
      ui.setDock('compliance', { open: true })
      runEditorCommand('compliance.checkDocument')
      return

    case 'compliance.checkFolder':
      ui.setView('folder')
      runEditorCommand('compliance.checkFolder')
      return

    case 'ai.open':
    case 'ai.askSelection':
    case 'ai.citeGuidance':
    case 'ai.precedentSearch':
      ui.setDock('chat', { open: true })
      return

    case 'view.printLayout':
      ui.setView('editor')
      return
    case 'view.zoom':
      doc.setZoom(doc.zoom === 100 ? 85 : 100)
      return

    case 'track.toggle':
      doc.toggleTrackChanges()
      return

    default:
      if (EDITOR_COMMAND_PREFIXES.some((p) => act.startsWith(p))) {
        runEditorCommand(act)
        return
      }
      console.info(`[ribbon] "${act}" is not wired yet`)
  }
}
