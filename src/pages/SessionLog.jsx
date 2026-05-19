import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeEstimatedOneRm } from '../lib/trainingMath'
import MiniProgress from '../components/MiniProgress'

function blockSortKey(block) {
  const b = String(block ?? 'A').trim().toUpperCase()
  if (b === 'A' || b === 'BLOCK A') return 0
  if (b === 'B' || b === 'BLOCK B') return 1
  return 2 + b.charCodeAt(0)
}

function blockHeading(block) {
  const b = String(block ?? 'A').trim().toUpperCase()
  if (b === 'A' || b === 'BLOCK A') return 'Block A'
  if (b === 'B' || b === 'BLOCK B') return 'Block B'
  if (!b) return 'Block'
  return b.length === 1 ? `Block ${b}` : block
}

function normalizeBlockKey(block) {
  const b = String(block ?? 'A').trim().toUpperCase()
  if (b === 'BLOCK A' || b === 'A') return 'A'
  if (b === 'BLOCK B' || b === 'B') return 'B'
  return b || 'A'
}

function exerciseName(row) {
  const ex = row.exercises
  if (ex && typeof ex === 'object' && !Array.isArray(ex)) return ex.name ?? 'Oefening'
  if (Array.isArray(ex) && ex[0]) return ex[0].name ?? 'Oefening'
  return 'Oefening'
}

function parseNum(s) {
  if (s === '' || s == null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export default function SessionLog() {
  const { id: sessionId } = useParams()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [sessionStatus, setSessionStatus] = useState(null)
  const [sessionClientId, setSessionClientId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [finishing, setFinishing] = useState(false)

  const [fields, setFields] = useState({})
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  const timersRef = useRef({})

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setError('')
    try {
      const [sRes, rRes] = await Promise.all([
        supabase.from('sessions').select('id, status, client_id').eq('id', sessionId).maybeSingle(),
        supabase
          .from('session_exercises')
          .select(
            `
            id,
            exercise_id,
            target_reps,
            advised_weight,
            weight_done,
            reps_done,
            estimated_1rm,
            block,
            sort_order,
            exercises ( name )
          `,
          )
          .eq('session_id', sessionId)
          .order('sort_order', { ascending: true }),
      ])
      if (sRes.error) throw sRes.error
      if (rRes.error) throw rRes.error
      if (!sRes.data) {
        setError('Sessie niet gevonden.')
        setRows([])
        setSessionClientId(null)
        return
      }
      setSessionStatus(sRes.data.status)
      setSessionClientId(sRes.data.client_id ?? null)
      const list = rRes.data || []
      setRows(list)
      const next = {}
      for (const row of list) {
        next[row.id] = {
          weight: row.weight_done != null ? String(row.weight_done) : '',
          reps: row.reps_done != null ? String(row.reps_done) : '',
        }
      }
      setFields(next)
    } catch (e) {
      setError(e?.message || 'Kon sessie niet laden.')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  const persistRow = useCallback(async (rowId) => {
    const f = fieldsRef.current[rowId]
    if (!f) return
    const weight = parseNum(f.weight)
    const reps = parseNum(f.reps)
    let estimated_1rm = null
    if (weight != null && reps != null) {
      estimated_1rm = computeEstimatedOneRm(weight, reps)
    }
    const { error: uErr } = await supabase
      .from('session_exercises')
      .update({
        weight_done: weight,
        reps_done: reps,
        estimated_1rm,
      })
      .eq('id', rowId)
    if (uErr) throw uErr
  }, [])

  const queueSave = useCallback(
    (rowId) => {
      if (timersRef.current[rowId]) clearTimeout(timersRef.current[rowId])
      timersRef.current[rowId] = setTimeout(() => {
        delete timersRef.current[rowId]
        void (async () => {
          try {
            setSaveError('')
            await persistRow(rowId)
          } catch (e) {
            setSaveError(e?.message || 'Opslaan mislukt.')
          }
        })()
      }, 500)
    },
    [persistRow],
  )

  const updateField = useCallback(
    (rowId, key, value) => {
      setFields((prev) => ({
        ...prev,
        [rowId]: { ...prev[rowId], [key]: value },
      }))
      queueSave(rowId)
    },
    [queueSave],
  )

  useEffect(() => {
    return () => {
      for (const t of Object.values(timersRef.current)) {
        clearTimeout(t)
      }
    }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const key = normalizeBlockKey(row.block)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(row)
    }
    const keys = [...map.keys()].sort((a, b) => blockSortKey(a) - blockSortKey(b))
    return keys.map((k) => ({ key: k, title: blockHeading(k), items: map.get(k) }))
  }, [rows])

  async function handleFinish() {
    if (!sessionId || finishing) return
    setFinishing(true)
    setSaveError('')
    try {
      for (const tid of Object.values(timersRef.current)) {
        clearTimeout(tid)
      }
      timersRef.current = {}
      for (const row of rows) {
        await persistRow(row.id)
      }

      const { error: uErr } = await supabase
        .from('sessions')
        .update({ status: 'Done' })
        .eq('id', sessionId)
      if (uErr) throw uErr
      navigate('/', { replace: true })
    } catch (e) {
      setSaveError(e?.message || 'Afronden mislukt.')
    } finally {
      setFinishing(false)
    }
  }

  if (!sessionId) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4 text-slate-600">
        Ongeldige sessie.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4 text-slate-500">
        Laden…
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-slate-700 min-h-[44px]">
          ← Overzicht
        </Link>
      </div>
    )
  }

  const isDone = sessionStatus === 'Done'

  return (
    <div className="min-h-svh w-full bg-slate-100 text-left">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] inline-flex items-center"
          >
            ← Overzicht
          </Link>
          <button
            type="button"
            disabled={finishing || isDone}
            onClick={() => void handleFinish()}
            className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50"
          >
            {finishing ? 'Bezig…' : 'Training afronden'}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {saveError ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {saveError}
          </div>
        ) : null}

        {isDone ? (
          <p className="mb-4 text-sm text-slate-500">Deze training is afgerond (alleen lezen).</p>
        ) : null}

        <div className="space-y-8">
          {grouped.map((group) => {
            const isBlockA = group.key === 'A'
            return (
            <section
              key={group.key}
              className={
                isBlockA
                  ? 'rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 sm:p-5 shadow-sm'
                  : 'rounded-2xl border border-sky-200/90 bg-sky-50/60 p-4 sm:p-5 shadow-sm'
              }
            >
              <h2 className="text-lg font-semibold text-slate-900 mb-4">{group.title}</h2>
              <ul className="space-y-8">
                {group.items.map((row) => {
                  const f = fields[row.id] || { weight: '', reps: '' }
                  const w = parseNum(f.weight)
                  const r = parseNum(f.reps)
                  const showE1 =
                    w != null && r != null ? computeEstimatedOneRm(w, r).toFixed(1) : null
                  const hasAdvice =
                    row.advised_weight != null && Number.isFinite(Number(row.advised_weight))

                  return (
                    <li key={row.id} className="border-b border-slate-200/80 pb-8 last:border-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-xl font-semibold text-slate-900 leading-snug">
                          {exerciseName(row)}
                        </p>
                        {sessionClientId && row.exercise_id ? (
                          <MiniProgress clientId={sessionClientId} exerciseId={row.exercise_id} />
                        ) : null}
                      </div>
                      {hasAdvice ? (
                        <p className="mt-1 text-base text-emerald-700/90">
                          Advies: {Number(row.advised_weight)} kg
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-slate-400">Geen eerdere 1RM voor advies</p>
                      )}

                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            className="block text-sm font-medium text-slate-600 mb-1.5"
                            htmlFor={`w-${row.id}`}
                          >
                            Weight done (kg)
                          </label>
                          <input
                            id={`w-${row.id}`}
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            min="0"
                            disabled={isDone}
                            value={f.weight}
                            onChange={(e) => updateField(row.id, 'weight', e.target.value)}
                            className="w-full min-h-[48px] rounded-xl border border-slate-200 bg-white px-3 text-lg text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                          />
                        </div>
                        <div>
                          <label
                            className="block text-sm font-medium text-slate-600 mb-1.5"
                            htmlFor={`r-${row.id}`}
                          >
                            Reps done
                          </label>
                          <input
                            id={`r-${row.id}`}
                            type="number"
                            inputMode="numeric"
                            step="1"
                            min="0"
                            disabled={isDone}
                            value={f.reps}
                            onChange={(e) => updateField(row.id, 'reps', e.target.value)}
                            className="w-full min-h-[48px] rounded-xl border border-slate-200 bg-white px-3 text-lg text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                        <span className="text-slate-500">
                          Target reps:{' '}
                          <span className="font-medium text-slate-800">{row.target_reps}</span>
                        </span>
                        {showE1 != null ? (
                          <span className="text-slate-700">
                            Estimated 1RM:{' '}
                            <span className="font-semibold tabular-nums">{showE1}</span> kg
                          </span>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
