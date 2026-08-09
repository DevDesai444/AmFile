import { useDocumentStore } from '../store/documentStore'

export default function SettingsView(): React.JSX.Element {
  const pageSetup = useDocumentStore((s) => s.pageSetup)

  return (
    <div className="settings-view">
      <h2>Settings</h2>
      <div className="settings-group">
        <div className="settings-row">
          <span>Page size</span>
          <span>{pageSetup.size}</span>
        </div>
        <div className="settings-row">
          <span>Platform</span>
          <span>{navigator.platform.includes('Win') ? 'Windows' : 'macOS'}</span>
        </div>
        <div className="settings-row">
          <span>AI provider</span>
          <span>Not connected (stub)</span>
        </div>
        <div className="settings-row">
          <span>Compliance backend</span>
          <span>Not connected (stub)</span>
        </div>
      </div>
    </div>
  )
}
