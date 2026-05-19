import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function mapAuthError(message) {
  const m = (message || '').toLowerCase()
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
    return 'Verkeerd e-mailadres of wachtwoord.'
  if (m.includes('email not confirmed')) return 'E-mailadres is nog niet bevestigd.'
  if (m.includes('too many requests')) return 'Te veel pogingen. Probeer het later opnieuw.'
  return 'Inloggen mislukt. Controleer je gegevens en probeer opnieuw.'
}

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) {
        setError(mapAuthError(signInError.message))
        return
      }
      navigate('/', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 px-8 py-10">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              PT Tracker
            </h1>
            <p className="mt-1 text-sm text-slate-500">Log in om verder te gaan</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error ? (
              <div
                role="alert"
                className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800"
              >
                {error}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                E-mailadres
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                placeholder="naam@voorbeeld.nl"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Wachtwoord
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none transition-colors"
            >
              {submitting ? 'Bezig…' : 'Inloggen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
