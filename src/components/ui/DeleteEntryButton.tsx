import { useState } from 'react'
import type { FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'

interface Props {
  label: string
  onDelete: (password: string) => Promise<{ error?: string }>
}

export function DeleteEntryButton({ label, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setOpen(false)
    setPassword('')
    setError(null)
  }

  const handleDelete = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!password.trim()) {
      setError('Password is required. Entry was not deleted.')
      return
    }

    setBusy(true)
    const res = await onDelete(password.trim())
    setBusy(false)

    if (res.error) {
      setError(res.error)
      return
    }

    close()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
        aria-label={`Delete ${label}`}
        title={`Delete ${label}`}
      >
        <Trash2 size={15} />
      </button>

      <Modal open={open} onClose={close} title={`Delete ${label}`}>
        <form onSubmit={handleDelete} className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Enter the delete password to permanently remove this {label}.
          </p>
          <Input
            label="Delete Password"
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={busy}>
              {busy ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
