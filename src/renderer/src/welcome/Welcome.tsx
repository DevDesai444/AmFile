import { useState } from 'react'
import { FolderPlus, FileText, Users } from 'lucide-react'
import logo from '../assets/amneal-logo.png'
import BlueprintCard from '../common/BlueprintCard'
import { useFolderStore } from '../store/folderStore'
import { useSessionStore } from '../store/sessionStore'
import { useUiStore } from '../store/uiStore'
import { useToastStore } from '../common/toastStore'

/**
 * Landing screen. Every action here must do something real — the previous version offered
 * "Open folder" (a native filesystem picker, meaningless once documents moved to the server)
 * and "New document" (created a local file with no server identity, so it could never be
 * saved). Both were dead ends.
 */
export default function Welcome(): React.JSX.Element {
  const createFolder = useFolderStore((s) => s.createFolder)
  const createDocument = useFolderStore((s) => s.createDocument)
  const folders = useFolderStore((s) => s.folders)
  const selectedFolder = useFolderStore((s) => s.selectedFolder)
  const user = useSessionStore((s) => s.user)
  const setView = useUiStore((s) => s.setView)
  const push = useToastStore((s) => s.push)
  const [busy, setBusy] = useState(false)

  const newProject = async (): Promise<void> => {
    const name = window.prompt('Name your new project')
    if (!name) return
    setBusy(true)
    await createFolder(name, null)
    setBusy(false)
  }

  // Somewhere to put it: whatever is selected, else the only project, else prompt first.
  const target = selectedFolder ?? (folders.length === 1 ? { id: folders[0].id, name: folders[0].name } : null)

  const newDocument = async (): Promise<void> => {
    if (!target) {
      push('Create a project first, or pick one in the left panel.', 'warn')
      return
    }
    const name = window.prompt(`New document in “${target.name}”`)
    if (!name) return
    setBusy(true)
    await createDocument(name, target.id)
    setBusy(false)
  }

  return (
    <div className="welcome">
      <img src={logo} alt="Amneal" className="welcome-logo" />
      <h1>AmFile</h1>
      <p className="welcome-subtitle">
        {user ? `Signed in as ${user.displayName}` : 'Regulatory document authoring'}
      </p>

      <div className="welcome-actions">
        <BlueprintCard className="welcome-action-card" onClick={busy ? undefined : () => void newProject()}>
          <FolderPlus size={22} strokeWidth={1.5} />
          <span>New project</span>
          <span className="welcome-action-hint">You own it and choose who joins</span>
        </BlueprintCard>

        <BlueprintCard className="welcome-action-card" onClick={busy ? undefined : () => void newDocument()}>
          <FileText size={22} strokeWidth={1.5} />
          <span>New document</span>
          <span className="welcome-action-hint">{target ? `into ${target.name}` : 'pick a project first'}</span>
        </BlueprintCard>

        {user?.roles.includes('admin') && (
          <BlueprintCard className="welcome-action-card" onClick={() => setView('users')}>
            <Users size={22} strokeWidth={1.5} />
            <span>People</span>
            <span className="welcome-action-hint">Add colleagues to AmFile</span>
          </BlueprintCard>
        )}
      </div>

      {folders.length === 0 && (
        <p className="welcome-empty-hint">
          You don’t have access to any projects yet. Start one, or ask an owner to add you to theirs.
        </p>
      )}
    </div>
  )
}
