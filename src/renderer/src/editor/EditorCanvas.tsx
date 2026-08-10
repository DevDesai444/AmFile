import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import LinkExtension from '@tiptap/extension-link'
import ImageExtension from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'

import { StyledParagraph } from './extensions/paragraphStyle'
import { Indent } from './extensions/indent'
import { PageBreak } from './extensions/pageBreak'
import { FontAttributes } from './extensions/fontAttributes'
import { Insertion, Deletion } from './extensions/trackChangeMarks'
import { TrackChangesPlugin } from './extensions/trackChangesPlugin'
import { CommentMark } from './extensions/comment'
import { handleEditorCommand } from './commandHandler'
import { registerEditorCommandHandler, setActiveEditor } from '../ribbon/editorCommandRegistry'
import { useOutlineSync } from './useOutlineSync'
import { useEditorStats } from './useEditorStats'
import { useTrackChangesSync } from './useTrackChangesSync'
import { useDocumentIO } from './useDocumentIO'
import { insertImage } from './insertImage'
import { useCommentStore } from '../store/commentStore'
import { useDocumentStore } from '../store/documentStore'
import { useComplianceStore } from '../store/complianceStore'
import { useServerDocsStore } from '../store/serverDocsStore'
import { useServerDocument } from './useServerDocument'
import FindReplaceBar from './FindReplaceBar'
import './editor.css'

export default function EditorCanvas(): React.JSX.Element {
  const [findState, setFindState] = useState<'closed' | 'find' | 'replace'>('closed')
  const fileName = useDocumentStore((s) => s.fileName)
  const filePath = useDocumentStore((s) => s.filePath)
  const zoom = useDocumentStore((s) => s.zoom)
  const markDirty = useDocumentStore((s) => s.markDirty)
  const pendingOpenPath = useDocumentStore((s) => s.pendingOpenPath)
  const clearPendingOpen = useDocumentStore((s) => s.clearPendingOpen)
  const headerText = useDocumentStore((s) => s.headerText)
  const footerText = useDocumentStore((s) => s.footerText)
  const resetToken = useDocumentStore((s) => s.resetToken)
  const checkDocument = useComplianceStore((s) => s.checkDocument)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ paragraph: false }),
      StyledParagraph,
      Indent,
      PageBreak,
      FontAttributes,
      Insertion,
      Deletion,
      TrackChangesPlugin,
      CommentMark,
      Underline,
      Subscript,
      Superscript,
      Color,
      Highlight.configure({ multicolor: true }),
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CharacterCount,
      Placeholder.configure({ placeholder: 'Start typing…' })
    ],
    content: '<p></p>',
    onUpdate: () => markDirty(),
    editorProps: {
      attributes: { class: 'editor-page-content' }
    }
  })

  const { save: saveLocal, openFromPath, exportPdf } = useDocumentIO(editor)
  const { saveToServer, reloadFromServer } = useServerDocument(editor)
  const documentId = useDocumentStore((s) => s.documentId)
  const lockedByOther = useDocumentStore((s) => s.lockedByOther)
  const pendingUpdate = useServerDocsStore((s) => s.pendingUpdate)

  // Server-backed documents save through the server (locking + revisions + audit);
  // a purely local document still saves straight to a .docx on disk.
  const save = documentId ? saveToServer : saveLocal
  useOutlineSync(editor)
  useEditorStats(editor)
  useTrackChangesSync(editor)

  useEffect(() => {
    if (!editor) return
    return useCommentStore.getState().registerDeleteHandler((id) => {
      editor.chain().focus().unsetCommentById(id).run()
    })
  }, [editor])

  useEffect(() => {
    if (!editor) return
    setActiveEditor('main')
    return registerEditorCommandHandler('main', (command, payload) => {
      if (command === 'save') {
        void save()
        return
      }
      if (command === 'print') {
        void exportPdf()
        return
      }
      if (command === 'compliance.checkDocument') {
        void checkDocument(filePath ?? fileName ?? 'untitled', filePath ?? fileName ?? 'untitled')
        return
      }
      if (command === 'edit.find') {
        setFindState('find')
        return
      }
      if (command === 'edit.replace') {
        setFindState('replace')
        return
      }
      if (command === 'insert.image') {
        insertImage(editor)
        return
      }
      handleEditorCommand(editor, command, payload)
    })
  }, [editor, save, exportPdf, checkDocument, filePath, fileName])

  useEffect(() => {
    if (pendingOpenPath && editor) {
      void openFromPath(pendingOpenPath).then(() => clearPendingOpen())
    }
  }, [pendingOpenPath, editor, openFromPath, clearPendingOpen])

  // Blank the editor when a new document is started. Comments are keyed to marks in the
  // old document, so they have to go with it.
  useEffect(() => {
    if (!editor || resetToken === 0) return
    editor.commands.setContent('<p></p>')
    useCommentStore.setState({ comments: [] })
  }, [editor, resetToken])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setFindState('find')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  if (!editor) return <div className="editor-scroll" />

  return (
    <div className="editor-scroll">
      {lockedByOther && (
        <div className="editor-banner editor-banner--locked">
          <strong>Read only.</strong> {lockedByOther} has this document checked out. Your changes cannot be saved until
          they check it back in.
        </div>
      )}

      {pendingUpdate && pendingUpdate.documentId === documentId && (
        <div className="editor-banner editor-banner--update">
          <span>
            <strong>{pendingUpdate.savedBy}</strong> saved revision {pendingUpdate.revision} of this document.
          </span>
          <button type="button" onClick={() => void reloadFromServer()}>
            Reload
          </button>
        </div>
      )}

      {findState !== 'closed' && (
        <FindReplaceBar editor={editor} showReplace={findState === 'replace'} onClose={() => setFindState('closed')} />
      )}
      <div className="editor-page" style={{ transform: `scale(${zoom / 100})` }}>
        {headerText && <div className="editor-page-header">{headerText}</div>}
        <EditorContent editor={editor} />
        {footerText && <div className="editor-page-footer">{footerText.replace('{page}', '1')}</div>}
      </div>
    </div>
  )
}
