import type { Editor } from '@tiptap/core'
import type { ParagraphStyleName } from './extensions/paragraphStyle'
import { useDocumentStore } from '../store/documentStore'
import { useOutlineStore } from '../store/outlineStore'
import { insertComment } from './insertComment'
import { notImplemented } from '../common/toastStore'

const LINE_SPACINGS = [1, 1.15, 1.5, 2]

function cycleLineSpacing(editor: Editor): void {
  const type = editor.state.selection.$from.parent.type.name
  if (type !== 'paragraph' && type !== 'heading') return
  const current = Number(editor.getAttributes(type).lineSpacing) || 1
  const idx = LINE_SPACINGS.indexOf(current)
  const next = LINE_SPACINGS[(idx + 1) % LINE_SPACINGS.length]
  editor.chain().focus().updateAttributes(type, { lineSpacing: next }).run()
}

function setParagraphStyle(editor: Editor, styleName: ParagraphStyleName): void {
  const chain = editor.chain().focus()
  if (styleName === null) {
    chain.setParagraph().updateAttributes('paragraph', { styleName: null }).run()
    return
  }
  chain.setParagraph().updateAttributes('paragraph', { styleName }).run()
}

export function handleEditorCommand(editor: Editor, command: string, payload?: unknown): void {
  const chain = () => editor.chain().focus()

  switch (command) {
    case 'mark.bold':
      chain().toggleBold().run()
      return
    case 'mark.italic':
      chain().toggleItalic().run()
      return
    case 'mark.underline':
      chain().toggleUnderline().run()
      return
    case 'mark.strike':
      chain().toggleStrike().run()
      return
    case 'mark.subscript':
      chain().toggleSubscript().run()
      return
    case 'mark.superscript':
      chain().toggleSuperscript().run()
      return
    case 'mark.clearFormatting':
      chain().unsetAllMarks().clearNodes().run()
      return

    case 'font.grow': {
      const current = Number(editor.getAttributes('textStyle').fontSize) || 11
      chain().setFontSize(Math.min(current + 1, 96)).run()
      return
    }
    case 'font.shrink': {
      const current = Number(editor.getAttributes('textStyle').fontSize) || 11
      chain().setFontSize(Math.max(current - 1, 6)).run()
      return
    }
    case 'font.setFamily':
      chain().setFontFamily(String(payload)).run()
      return
    case 'font.setSize':
      chain().setFontSize(Number(payload)).run()
      return
    case 'font.changeCase': {
      const { from, to, empty } = editor.state.selection
      if (empty) return
      const text = editor.state.doc.textBetween(from, to)
      const isUpper = text === text.toUpperCase()
      chain().insertContentAt({ from, to }, isUpper ? text.toLowerCase() : text.toUpperCase()).run()
      return
    }

    case 'align.left':
      chain().setTextAlign('left').run()
      return
    case 'align.center':
      chain().setTextAlign('center').run()
      return
    case 'align.right':
      chain().setTextAlign('right').run()
      return
    case 'align.justify':
      chain().setTextAlign('justify').run()
      return

    case 'list.bullet':
      chain().toggleBulletList().run()
      return
    case 'list.ordered':
      chain().toggleOrderedList().run()
      return

    case 'paragraph.indent':
      chain().indent().run()
      return
    case 'paragraph.outdent':
      chain().outdent().run()
      return
    case 'paragraph.lineSpacing':
      cycleLineSpacing(editor)
      return

    case 'style.heading1':
      chain().setHeading({ level: 1 }).run()
      return
    case 'style.heading2':
      chain().setHeading({ level: 2 }).run()
      return
    case 'style.normal':
      setParagraphStyle(editor, null)
      return
    case 'style.tableCaption':
      setParagraphStyle(editor, 'tableCaption')
      return
    case 'style.ctdSection':
      setParagraphStyle(editor, 'ctdSection')
      return
    case 'style.reference':
      setParagraphStyle(editor, 'reference')
      return

    case 'insert.table':
      chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      return
    case 'insert.pageBreak':
    case 'insert.blankPage':
      chain().setPageBreak().run()
      return
    case 'insert.link': {
      const url = window.prompt('Link URL')
      if (url) chain().setLink({ href: url }).run()
      return
    }
    case 'insert.comment':
    case 'comment.new':
      insertComment(editor)
      return
    case 'insert.header': {
      const text = window.prompt('Header text', useDocumentStore.getState().headerText)
      if (text !== null) useDocumentStore.getState().setHeaderText(text)
      return
    }
    case 'insert.footer':
    case 'insert.pageNumber': {
      const text = window.prompt('Footer text (use {page} for the page number)', useDocumentStore.getState().footerText)
      if (text !== null) useDocumentStore.getState().setFooterText(text)
      return
    }
    case 'toc.addText':
    case 'toc.update': {
      const headings = useOutlineStore.getState().headings
      if (headings.length === 0) {
        window.alert('Add some headings first — the table of contents lists them.')
        return
      }
      const items = headings.map((h) => ({
        type: 'paragraph',
        attrs: { indent: Math.max(h.level - 1, 0) },
        content: [{ type: 'text', text: h.text || 'Untitled heading' }]
      }))
      chain().insertContent(items).run()
      return
    }

    case 'layout.orientation':
      useDocumentStore.getState().cycleOrientation()
      return
    case 'layout.margins':
      useDocumentStore.getState().cycleMargins()
      return
    case 'layout.sizeA4':
      useDocumentStore.setState((s) => ({ pageSetup: { ...s.pageSetup, size: 'A4' }, dirty: true }))
      return

    case 'edit.cut':
      document.execCommand('cut')
      return
    case 'edit.copy':
      document.execCommand('copy')
      return
    case 'edit.select':
      chain().selectAll().run()
      return

    case 'review.wordCount': {
      const words = editor.storage.characterCount?.words?.() ?? 0
      const chars = editor.storage.characterCount?.characters?.() ?? 0
      window.alert(`${words} words, ${chars} characters`)
      return
    }

    case 'save':
    case 'print':
    case 'compliance.checkDocument':
    case 'compliance.checkFolder':
    case 'insert.image':
      // Handled by ribbonActions / EditorCanvas save wiring, not the editor itself.
      return

    default: {
      const leaf = command.includes('.') ? command.slice(command.indexOf('.') + 1) : command
      const label = leaf.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      notImplemented(label.charAt(0).toUpperCase() + label.slice(1))
    }
  }
}
