import { FolderOpen, FilePlus } from 'lucide-react'
import logo from '../assets/amneal-logo.png'
import BlueprintCard from '../common/BlueprintCard'
import { runRibbonAction } from '../ribbon/ribbonActions'

export default function Welcome(): React.JSX.Element {
  return (
    <div className="welcome">
      <img src={logo} alt="Amneal" className="welcome-logo" />
      <h1>AmFile</h1>
      <p className="welcome-subtitle">Regulatory document authoring, internal build</p>

      <div className="welcome-actions">
        <BlueprintCard className="welcome-action-card" onClick={() => runRibbonAction('folder.open')}>
          <FolderOpen size={22} strokeWidth={1.5} />
          <span>Open folder</span>
        </BlueprintCard>
        <BlueprintCard className="welcome-action-card" onClick={() => runRibbonAction('file.new')}>
          <FilePlus size={22} strokeWidth={1.5} />
          <span>New document</span>
        </BlueprintCard>
      </div>
    </div>
  )
}
