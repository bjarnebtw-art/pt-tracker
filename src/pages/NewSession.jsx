import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeAdvisedWeight } from '../lib/trainingMath'

function todayIsoDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param {string} clientId
 * @returns {Promise<Map<string, number>>} exercise_id -> latest estimated_1rm
 */
async function fetchLatestOneRmByExercise(clientId) {
  const { data, error } = await supabase
    .from('session_exercises')
    .select(
      `
      exercise_id,
      estimated_1rm,
      sessions!inner ( date, client_id )
    `,
    )
    .eq('sessions.client_id', clientId)
    .not('estimated_1rm', 'is', null)

  if (error) throw error

  /** @type {Map<string, { e1: number, date: string }>} */
  const best = new Map()
  for (const row of data || []) {
    const exId = row.exercise_id
    const e1 = row.estimated_1rm
    const sess = row.sessions
    const date = Array.isArray(sess) ? sess[0]?.date : sess?.date
    if (exId == null || e1 == null || date == null) continue
    const prev = best.get(exId)
    if (!prev || String(date) > String(prev.date)) {
      best.set(exId, { e1: Number(e1), date: String(date) })
    }
  }
  const out = new Map()
  for (const [id, v] of best) out.set(id, v.e1)
  return out
}

export default function NewSession() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [templates, setTemplates] = useState([])
  const [clientId, setClientId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [date, setDate] = useState(todayIsoDate)
  const [loadingLists, setLoadingLists] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const loadLists = useCallback(async () => {
    setLoadingLists(true)
    setError('')
    try {
      const [cRes, tRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('active', true).order('name'),
        supabase.from('workout_templates').select('id, name').order('name'),
      ])
      if (cRes.error) throw cRes.error
      if (tRes.error) throw tRes.error
      setClients(cRes.data || [])
      setTemplates(tRes.data || [])
    } catch (e) {
      setError(e?.message || 'Kon gegevens niet laden.')
    } finally {
      setLoadingLists(false)
    }
  }, [])

  useEffect(() => {
    void loadLists()
  }, [loadLists])

  const canStart = useMemo(
    () => Boolean(clientId && templateId && date && !starting),
    [clientId, templateId, date, starting],
  )

  async function handleStart() {
    if (!canStart) return
    setStarting(true)
    setError('')
    try {
      const { data: sessionRow, error: sErr } = await supabase
        .from('sessions')
        .insert({
          client_id: clientId,
          workout_template_id: templateId,
          date,
          status: 'InProgress',
        })
        .select('id')
        .single()
      if (sErr) throw sErr
      const sessionId = sessionRow.id

      const { data: tEx, error: tErr } = await supabase
        .from('template_exercises')
        .select('exercise_id, target_reps, block, id')
        .eq('workout_template_id', templateId)
        .order('id', { ascending: true })
      if (tErr) throw tErr
      if (!tEx?.length) {
        await supabase.from('sessions').delete().eq('id', sessionId)
        throw new Error('Deze template heeft geen oefeningen.')
      }

      const oneRmMap = await fetchLatestOneRmByExercise(clientId)

      const rows = tEx.map((row, idx) => {
        const targetReps = Number(row.target_reps)
        const prev = oneRmMap.get(row.exercise_id)
        let advised_weight = null
        if (prev != null && Number.isFinite(prev) && Number.isFinite(targetReps)) {
          advised_weight = computeAdvisedWeight(prev, targetReps)
        }
        const blockVal = row.block != null ? String(row.block) : 'A'
        const sortOrder = idx
        return {
          session_id: sessionId,
          exercise_id: row.exercise_id,
          target_reps: targetReps,
          advised_weight,
          block: blockVal,
          sort_order: sortOrder,
          weight_done: null,
          reps_done: null,
          estimated_1rm: null,
        }
      })

      const { error: insErr } = await supabase.from('session_exercises').insert(rows)
      if (insErr) throw insErr

      navigate(`/session/${sessionId}`, { replace: true })
    } catch (e) {
      setError(e?.message || 'Starten van de training is mislukt.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-8">
      <div className="mb-6">
        <Link
          to="/"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] inline-flex items-center"
        >
          ← Overzicht
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
        Nieuwe sessie
      </h1>
      <p className="mt-1 text-slate-600 text-sm">
        Kies klant en template om te beginnen.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      {loadingLists ? (
        <p className="mt-10 text-center text-slate-500">Laden…</p>
      ) : (
        <div className="mt-8 space-y-6">
          <div>
            <label
              htmlFor="ns-client"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Klant
            </label>
            <select
              id="ns-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">— Kies klant —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ns-template"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Workout template
            </label>
            <select
              id="ns-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">— Kies template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ns-date"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Datum
            </label>
            <input
              id="ns-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <button
            type="button"
            disabled={!canStart}
            onClick={() => void handleStart()}
            className="w-full min-h-[52px] rounded-xl bg-slate-900 text-base font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            {starting ? 'Bezig…' : 'Start training'}
          </button>
        </div>
      )}
    </main>
  )
}
