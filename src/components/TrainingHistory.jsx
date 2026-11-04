import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function formatDate(date) {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

export default function TrainingHistory({ clientId }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const { data, error: queryError } = await supabase.from('sessions')
          .select('id, date, status, notes, duration_min, rpe, session_exercises(id, exercise_name, exercise_id, block, sort_order, set_number, reps_done, weight_done, notes, exercises(name))')
          .eq('client_id', clientId).order('date', { ascending: false })
          .order('created_at', { ascending: false })
        if (queryError) throw queryError
        if (!cancelled) setSessions(data || [])
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Trainingshistorie laden mislukt.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [clientId, attempt])

  return (
    <section className="mt-8" aria-labelledby="history-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="history-heading" className="text-lg font-semibold text-slate-900">Trainingshistorie</h2>
        <button type="button" disabled={loading} onClick={() => setAttempt((a) => a + 1)} className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm disabled:opacity-50">Vernieuwen</button>
      </div>
      <p className="mt-1 text-sm text-slate-600">Open een training voor alle oefeningen, rondes en bijzonderheden.</p>
      {loading ? <p className="mt-4 text-slate-500">Trainingen laden…</p> : error ? (
        <p role="alert" className="mt-4 text-red-700">{error}</p>
      ) : !sessions.length ? <p className="mt-4 text-slate-500">Nog geen trainingen opgeslagen.</p> : (
        <div className="mt-4 space-y-3">
          {sessions.map((session, index) => {
            const rows = [...(session.session_exercises || [])].sort((a, b) =>
              (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.set_number ?? 0) - (b.set_number ?? 0))
            const groups = new Map()
            for (const row of rows) {
              const key = JSON.stringify([row.block, row.sort_order, row.exercise_id, row.exercise_name])
              if (!groups.has(key)) groups.set(key, [])
              groups.get(key).push(row)
            }
            const status = { Done: 'Afgerond', Planned: 'Gepland', InProgress: 'Bezig', 'In Progress': 'Bezig' }[session.status] || session.status || 'Status onbekend'
            return (
              <details key={session.id} open={index === 0 ? true : undefined} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="min-h-[44px] cursor-pointer font-semibold text-slate-900">
                  {formatDate(session.date)} · {status}
                  {session.duration_min != null ? ` · ${session.duration_min} min` : ''}
                </summary>
                {session.notes ? <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{session.notes}</div> : null}
                {session.rpe != null ? <p className="mt-2 text-sm">Ervaren zwaarte: {session.rpe}/10</p> : null}
                <ul className="mt-3 divide-y divide-slate-200">
                  {[...groups.entries()].map(([key, sets]) => {
                    const first = sets[0]
                    const linked = Array.isArray(first.exercises) ? first.exercises[0] : first.exercises
                    const notes = [...new Set(sets.map((s) => s.notes?.trim()).filter(Boolean))]
                    return (
                      <li key={key} className="py-3">
                        <h3 className="text-sm font-semibold text-slate-900">{first.block ? `${first.block} · ` : ''}{first.exercise_name || linked?.name || 'Oefening'}</h3>
                        <ul className="mt-1 space-y-1 text-sm text-slate-600">
                          {sets.map((set) => (
                            <li key={set.id}>
                              {set.set_number != null ? `Ronde ${set.set_number}: ` : ''}
                              {set.reps_done != null ? `${set.reps_done} herhalingen` : 'Herhalingen niet vastgelegd'}
                              {set.weight_done != null ? ` · ${Number(set.weight_done)} kg` : ''}
                            </li>
                          ))}
                        </ul>
                        {notes.map((note) => <p key={note} className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{note}</p>)}
                      </li>
                    )
                  })}
                </ul>
                {!rows.length ? <p className="mt-3 text-sm text-slate-500">Geen afzonderlijke oefeningen vastgelegd.</p> : null}
              </details>
            )
          })}
        </div>
      )}
    </section>
  )
}
