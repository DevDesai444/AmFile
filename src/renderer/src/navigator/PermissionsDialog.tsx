import { useEffect, useState, useCallback } from 'react'
import { X, ShieldCheck } from 'lucide-react'
import BlueprintCard from '../common/BlueprintCard'
import { api, type FolderMember, type DirectoryUser } from '../api/client'
import { useFolderStore, type Access } from '../store/folderStore'
import { useToastStore } from '../common/toastStore'

const LEVELS: Array<{ value: Access; label: string; hint: string }> = [
  { value: 'viewer', label: 'Read only', hint: 'Open and read. Cannot check out or save.' },
  { value: 'editor', label: 'Can edit', hint: 'Check out, edit and save new revisions.' },
  { value: 'owner', label: 'Owner', hint: 'Everything an editor can do, plus manage access.' }
]

export default function PermissionsDialog(): React.JSX.Element | null {
  const target = useFolderStore((s) => s.permissionsFor)
  const close = useFolderStore((s) => s.closePermissions)
  const refresh = useFolderStore((s) => s.refresh)
  const push = useToastStore((s) => s.push)

  const [members, setMembers] = useState<FolderMember[]>([])
  const [directory, setDirectory] = useState<DirectoryUser[]>([])
  const [addUserId, setAddUserId] = useState('')
  const [addAccess, setAddAccess] = useState<Access>('editor')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!target) return
    try {
      const [{ members }, { users }] = await Promise.all([api.folderMembers(target.id), api.userDirectory()])
      setMembers(members)
      setDirectory(users)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not load permissions.', 'error')
    }
  }, [target, push])

  useEffect(() => {
    void load()
  }, [load])

  if (!target) return null

  const change = async (userId: string, access: Access | null): Promise<void> => {
    setBusy(true)
    try {
      await api.setFolderAccess(target.id, userId, access)
      await load()
      await refresh()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not change access.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const alreadyDirect = new Set(members.filter((m) => !m.inherited).map((m) => m.userId))
  const addable = directory.filter((u) => !alreadyDirect.has(u.id))

  return (
    <div className="dialog-backdrop" onClick={close}>
      <BlueprintCard className="permissions-dialog" onClick={() => undefined}>
        <div className="permissions-head" onClick={(e) => e.stopPropagation()}>
          <div>
            <div className="permissions-kicker">Folder access</div>
            <h2>{target.name}</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <div className="permissions-note">
            <ShieldCheck size={12} strokeWidth={1.5} />
            <span>Access is inherited by sub-folders and every document inside.</span>
          </div>

          <table className="permissions-table">
            <tbody>
              {members.length === 0 && (
                <tr>
                  <td colSpan={3} className="permissions-empty">
                    Only administrators can reach this folder.
                  </td>
                </tr>
              )}
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <div className="permissions-name">{m.displayName}</div>
                    <div className="permissions-email">{m.email}</div>
                  </td>
                  <td>
                    {m.inherited ? (
                      <span className="permissions-inherited" title="Granted on a parent folder">
                        {LEVELS.find((l) => l.value === m.access)?.label} · inherited
                      </span>
                    ) : (
                      <select
                        value={m.access}
                        disabled={busy}
                        onChange={(e) => void change(m.userId, e.target.value as Access)}
                      >
                        {LEVELS.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="permissions-actions">
                    {!m.inherited && (
                      <button type="button" disabled={busy} onClick={() => void change(m.userId, null)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="permissions-add">
            <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
              <option value="">Add someone…</option>
              {addable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} — {u.email}
                </option>
              ))}
            </select>
            <select value={addAccess} onChange={(e) => setAddAccess(e.target.value as Access)}>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="permissions-add-btn"
              disabled={!addUserId || busy}
              onClick={async () => {
                await change(addUserId, addAccess)
                setAddUserId('')
              }}
            >
              Grant
            </button>
          </div>

          <div className="permissions-legend">
            {LEVELS.map((l) => (
              <div key={l.value}>
                <strong>{l.label}</strong> — {l.hint}
              </div>
            ))}
          </div>
        </div>
      </BlueprintCard>
    </div>
  )
}
