import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const emptyForm = { name: '', email: '', goal: '' }

export default function ClientList() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: qErr } = await supabase
        .from('clients')
        .select('id, name, email, goal, active')
        .order('name')
      if (qErr) throw qErr
      setClients(data || [])
    } catch (e) {
      setError(e?.message || 'Kon klanten niet laden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  async function handleAddClient(e) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setError('Naam is verplicht.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const { error: insErr } = await supabase.from('clients').insert({
        name,
        email: form.email.trim() || null,
        goal: form.goal.trim() || null,
        active: true,
      })
      if (insErr) throw insErr
      setForm(emptyForm)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err?.message || 'Klant toevoegen is mislukt.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(client) {
    setTogglingId(client.id)
    setError('')
    try {
      const { error: updErr } = await supabase
        .from('clients')
        .update({ active: !client.active })
        .eq('id', client.id)
      if (updErr) throw updErr
      setClients((prev) =>
        prev.map((c) => (c.id === client.id ? { ...c, active: !c.active } : c)),
      )
    } catch (err) {
      setError(err?.message || 'Status bijwerken is mislukt.')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Klanten</h1>
          <p className="mt-1 text-sm text-slate-600">Beheer al je klanten op één plek.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v)
            setError('')
          }}
          className="min-h-[44px] shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
        >
          {showForm ? 'Annuleren' : 'Klant toevoegen'}
        </button>
      </header>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form
          onSubmit={(e) => void handleAddClient(e)}
          className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-base font-semibold text-slate-900">Nieuwe klant</h2>

          <div>
            <label htmlFor="cl-name" className="mb-2 block text-sm font-medium text-slate-700">
              Naam
            </label>
            <input
              id="cl-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div>
            <label htmlFor="cl-email" className="mb-2 block text-sm font-medium text-slate-700">
              E-mail
            </label>
            <input
              id="cl-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div>
            <label htmlFor="cl-goal" className="mb-2 block text-sm font-medium text-slate-700">
              Doel
            </label>
            <input
              id="cl-goal"
              type="text"
              value={form.goal}
              onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
              placeholder="Bijv. spieropbouw, afvallen"
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[48px] rounded-xl bg-slate-900 text-base font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50"
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </form>
      ) : null}

      <section className="mt-8" aria-labelledby="clients-table-heading">
        <h2 id="clients-table-heading" className="sr-only">
          Klantenlijst
        </h2>

        {loading ? (
          <p className="text-sm text-slate-500">Laden…</p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen klanten. Voeg er een toe om te beginnen.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                    Naam
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                    E-mail
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                    Doel
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                    Actief
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {clients.map((client) => (
                  <tr key={client.id} className={client.active ? '' : 'bg-slate-50/80'}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        to={`/client/${client.id}/progress`}
                        className="hover:text-slate-600 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      >
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{client.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{client.goal || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(client.active)}
                        aria-label={`${client.name} ${client.active ? 'deactiveren' : 'activeren'}`}
                        disabled={togglingId === client.id}
                        onClick={() => void handleToggleActive(client)}
                        className={[
                          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-50',
                          client.active ? 'bg-slate-900' : 'bg-slate-200',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                            client.active ? 'translate-x-6' : 'translate-x-1',
                          ].join(' ')}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
