import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, FileText, Search } from 'lucide-react'
import logo from '../assets/amneal-logo.png'
import { useDocumentStore } from '../store/documentStore'

export default function TitleBar(): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)
  const fileName = useDocumentStore((s) => s.fileName)
  const savedAt = useDocumentStore((s) => s.savedAt)
  const dirty = useDocumentStore((s) => s.dirty)

  useEffect(() => {
    if (!window.amfile) return
    window.amfile.window.isMaximized().then(setIsMaximized)
    return window.amfile.window.onMaximizeChanged(setIsMaximized)
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag titlebar-left">
        <img src={logo} alt="Amneal" className="titlebar-logo" />
        <div className="titlebar-divider" />
        <span className="titlebar-wordmark">AMFILE</span>
      </div>

      <div className="titlebar-drag titlebar-center">
        {fileName && (
          <>
            <FileText size={13} strokeWidth={1.5} className="titlebar-file-icon" />
            <span className="titlebar-filename">{fileName}</span>
            {savedAt && !dirty && <span className="titlebar-saved-badge">Saved {savedAt}</span>}
            {dirty && <span className="titlebar-saved-badge titlebar-saved-badge--dirty">Unsaved</span>}
          </>
        )}
      </div>

      <div className="titlebar-right">
        <button className="titlebar-search-btn" type="button">
          <Search size={13} strokeWidth={1.5} />
          <span>Search</span>
        </button>
        <div className="titlebar-avatar">RD</div>
        <div className="titlebar-winctl">
          <button type="button" aria-label="Minimize" onClick={() => window.amfile.window.minimize()}>
            <Minus size={13} strokeWidth={1.5} />
          </button>
          <button type="button" aria-label="Maximize" onClick={() => window.amfile.window.maximizeToggle()}>
            {isMaximized ? <Copy size={11} strokeWidth={1.5} /> : <Square size={11} strokeWidth={1.5} />}
          </button>
          <button
            type="button"
            aria-label="Close"
            className="titlebar-winctl-close"
            onClick={() => window.amfile.window.close()}
          >
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
