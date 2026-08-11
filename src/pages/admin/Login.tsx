import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import { BrandLogo } from '../../components/BrandLogo'

export default function Login() {
  const { signIn } = useAdminAuth()
  const navigate = useNavigate()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signIn(login, password)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    navigate('/admin/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <form onSubmit={submit} className="card max-w-sm w-full">
        <div className="mb-4 flex justify-center">
          <BrandLogo size="lg" />
        </div>
        <h2 className="text-xl font-bold text-center text-slate-900 dark:text-white">Admin Sign In</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1 mb-6">Branch Manager</p>

        <div className="space-y-4">
          <Input label="Username" autoComplete="username" required value={login} onChange={(e) => setLogin(e.target.value)} placeholder="admin" />
          <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign In'}
          </Button>
        </div>
      </form>
    </div>
  )
}
