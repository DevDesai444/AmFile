import { useEffect } from 'react'
import './design/fonts.css'
import './design/tokens.css'
import './design/blueprint.css'
import './App.css'
import TitleBar from './titlebar/TitleBar'
import TabBar from './ribbon/TabBar'
import Ribbon from './ribbon/Ribbon'
import Navigator from './navigator/Navigator'
import Dock from './dock/Dock'
import StatusBar from './statusbar/StatusBar'
import Welcome from './welcome/Welcome'
import LoginView from './welcome/LoginView'
import SettingsView from './welcome/SettingsView'
import EditorCanvas from './editor/EditorCanvas'
import FolderRun from './dock/FolderRun'
import { useUiStore } from './store/uiStore'
import { useDocumentStore } from './store/documentStore'
import { useComplianceStore } from './store/complianceStore'
import { useSessionStore } from './store/sessionStore'
import { useServerDocsStore } from './store/serverDocsStore'
import { connectEvents } from './api/client'

export default function App(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  const dirty = useDocumentStore((s) => s.dirty)
  const applyFolderProgress = useComplianceStore((s) => s.applyFolderProgress)
  const status = useSessionStore((s) => s.status)
  const restore = useSessionStore((s) => s.restore)
  const setServerOnline = useSessionStore((s) => s.setServerOnline)
  const setPresence = useSessionStore((s) => s.setPresence)
  const handleServerEvent = useServerDocsStore((s) => s.handleServerEvent)
  const refreshDocuments = useServerDocsStore((s) => s.refresh)

  useEffect(() => {
    void restore()
  }, [restore])

  useEffect(() => {
    if (!window.amfile) return
    return window.amfile.compliance.onFolderProgress((_folderId, update) => applyFolderProgress(update))
  }, [applyFolderProgress])

  // Keep the main process's copy of the unsaved flag current — it guards window close, and
  // a close handler cannot ask the renderer after the fact.
  useEffect(() => {
    if (!window.amfile) return
    void window.amfile.window.setDirty(dirty)
  }, [dirty])

  // One event stream for the whole app, opened only once signed in.
  useEffect(() => {
    if (status !== 'signed-in') return
    void refreshDocuments()
    return connectEvents(
      (e) => {
        if (e.event === 'presence:changed') {
          setPresence(e.payload.userId, e.payload.displayName, e.payload.online)
          return
        }
        handleServerEvent(e)
      },
      (online) => setServerOnline(online)
    )
  }, [status, handleServerEvent, refreshDocuments, setPresence, setServerOnline])

  if (status === 'unknown') {
    return (
      <div className="app-shell">
        <TitleBar />
        <div className="app-body" />
      </div>
    )
  }

  if (status === 'signed-out') {
    return (
      <div className="app-shell">
        <TitleBar />
        <div className="app-body">
          <div className="app-center">
            <LoginView />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <TabBar />
      <Ribbon />
      <div className="app-body">
        <Navigator />
        <div className="app-center">
          {view === 'welcome' && <Welcome />}
          {view === 'editor' && <EditorCanvas />}
          {view === 'folder' && <FolderRun />}
          {view === 'settings' && <SettingsView />}
        </div>
        <Dock />
      </div>
      <StatusBar />
    </div>
  )
}
