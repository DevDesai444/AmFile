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
import SettingsView from './welcome/SettingsView'
import EditorCanvas from './editor/EditorCanvas'
import FolderRun from './dock/FolderRun'
import { useUiStore } from './store/uiStore'
import { useComplianceStore } from './store/complianceStore'

export default function App(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  const applyFolderProgress = useComplianceStore((s) => s.applyFolderProgress)

  useEffect(() => {
    if (!window.amfile) return
    return window.amfile.compliance.onFolderProgress((_folderId, update) => applyFolderProgress(update))
  }, [applyFolderProgress])

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
