import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function todayIsoDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTodayNl() {
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

function clientName(row) {
  const c = row.clients
  if (c && typeof c === 'object' && !Array.isArray(c)) return c.name ?? 'Klant'
  if (Array.isArray(c) && c[0]) return c[0].name ?? 'Klant'
  return 'Klant'
}

function templateName(row) {
  const t = row.workout_templates
  if (t && typeof t === 'object' && !Array.isArray(t)) return t.name ?? 'Template'
  if (Array.isArray(t) && t[0]) return t[0].name ?? 'Template'
  return 'Template'
}

function statusLabel(status) {
  if (status === 'Planned') return 'Gepland'
  if (status === 'InProgress' || status === 'In Progress') return 'Bezig'
  return status ?? '—'
}

const TODAY_STATUSES = ['Planned', 'InProgress', 'In Progress']

export default function Dashboard() {
  const navigate = useNavigate()
  const todayIso = useMemo(() => todayIsoDate(), [])
  const todayLabel = useMemo(() => formatTodayNl(), [])

  const [sessions, setSessions] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [sRes, cRes] = await Promise.all([
        supabase
          .from('sessions')
          .select(
            `
            id,
            status,
            clients ( name ),
            workout_templates ( name )
          `,
          )
          .eq('date', todayIso)
          .in('status', TODAY_STATUSES)
          .order('status'),
        supabase.from('clients').select('id, name').eq('active', true).order('name'),
      ])
      if (sRes.error) throw sRes.error
      if (cRes.error) throw cRes.error
      setSessions(sRes.data || [])
      setClients(cRes.data || [])
    } catch (e) {
      setError(e?.message || 'Kon gegevens niet laden.')
    } finally {
      setLoading(false)
    }
  }, [todayIso])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Goedemorgen
        </h1>
        <p className="mt-1 text-sm text-slate-600 capitalize">{todayLabel}</p>
      </header>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <section className="mt-8" aria-labelledby="today-heading">
        <h2 id="today-heading" className="text-lg font-semibold text-slate-900">
          Vandaag
        </h2>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Laden…</p>
        ) : sessions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Geen geplande of lopende trainingen vandaag.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="font-medium text-slate-900">{clientName(s)}</p>
                <p className="mt-0.5 text-sm text-slate-600">{templateName(s)}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {statusLabel(s.status)}
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/session/${s.id}`)}
                  className="mt-4 w-full min-h-[44px] rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                >
                  Open training
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => navigate('/new-session')}
        className="mt-8 w-full min-h-[56px] rounded-xl bg-slate-900 text-base font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
      >
        + Nieuwe training starten
      </button>

      <section className="mt-10" aria-labelledby="clients-heading">
        <h2 id="clients-heading" className="text-lg font-semibold text-slate-900">
          Klanten
        </h2>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Laden…</p>
        ) : clients.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Geen actieve klanten.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/client/${c.id}/progress`}
                  className="flex min-h-[48px] items-center px-4 py-3 text-base font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-900/10"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
