import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeEstimatedOneRm, defaultSetWeight } from '../lib/trainingMath'

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
  const n = Number(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function exerciseGroupKey(row) {
  return `${row.sort_order ?? 0}-${row.exercise_id}`
}

function roundToNearest2_5(value) {
  if (value == null || !Number.isFinite(Number(value))) return null
  return Math.round(Number(value) / 2.5) * 2.5
}

function advisedWeightFromOneRm(oneRm, targetReps) {
  const one = Number(oneRm)
  const reps = Number(targetReps)
  if (!Number.isFinite(one) || !Number.isFinite(reps)) return null
  return roundToNearest2_5(one / (1 + reps / 30))
}

function groupRowsIntoExercises(rowList) {
  const map = new Map()
  for (const row of rowList) {
    const key = exerciseGroupKey(row)
    if (!map.has(key)) {
      map.set(key, {
        key,
        exercise_id: row.exercise_id,
        sort_order: row.sort_order,
        block: row.block,
        advised_weight: row.advised_weight,
        target_reps: row.target_reps,
        totalSets: Math.max(1, Number(row.sets) || 1),
        name: exerciseName(row),
        sets: [],
      })
    }
    const g = map.get(key)
    g.sets.push(row)
    if (row.advised_weight != null) g.advised_weight = row.advised_weight
  }
  for (const g of map.values()) {
    g.sets.sort((a, b) => (Number(a.set_number) || 1) - (Number(b.set_number) || 1))
    const maxSets = Math.max(g.totalSets, g.sets.length)
    g.totalSets = maxSets
  }
  return [...map.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function initialFieldForRow(row, totalSets) {
  const setNum = Number(row.set_number) || 1
  const reps =
  row.reps_done != null
    ? String(row.reps_done)
    : row.target_reps != null
      ? String(row.target_reps)
      : ''
  if (row.weight_done != null) {
    return { weight: String(row.weight_done), reps }
  }
  const advised = row.advised_weight
  if (advised != null && Number.isFinite(Number(advised))) {
    const w = defaultSetWeight(Number(advised), setNum, totalSets)
    return { weight: String(w), reps }
  }
  return { weight: '', reps }
}

function isTopsetRow(row, setRows) {
  const setNum = Number(row.set_number) || 1
  const maxSetNum = Math.max(1, ...setRows.map((r) => Number(r.set_number) || 1))
  return setNum >= maxSetNum
}

export default function SessionLog() {
  const { id: sessionId } = useParams()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [sessionStatus, setSessionStatus] = useState(null)
  const [sessionClientId, setSessionClientId] = useState(null)
  const [sessionNotes, setSessionNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [finishing, setFinishing] = useState(false)

  const [allExercises, setAllExercises] = useState([])
  const [swapTarget, setSwapTarget] = useState(null)
  const [swapSearch, setSwapSearch] = useState('')
  const [swapping, setSwapping] = useState(false)

  const [fields, setFields] = useState({})
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  const rowMetaRef = useRef({})
  const timersRef = useRef({})

  const loadExercises = useCallback(async () => {
    const { data, error: exErr } = await supabase
      .from('exercises')
      .select('id, name, category')
      .order('name', { ascending: true })
    if (exErr) throw exErr
    setAllExercises(data || [])
  }, [])

  const rebuildFieldsAndMeta = useCallback((list) => {
    const exercises = groupRowsIntoExercises(list)
    const meta = {}
    const next = {}
    for (const ex of exercises) {
      for (const row of ex.sets) {
        next[row.id] = initialFieldForRow(row, ex.totalSets)
        meta[row.id] = {
          isTopset: isTopsetRow(row, ex.sets),
        }
      }
    }
    rowMetaRef.current = meta
    setFields(next)
  }, [])

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
            set_number,
            sets,
            exercises ( name )
          `,
          )
          .eq('session_id', sessionId)
          .order('sort_order', { ascending: true })
          .order('set_number', { ascending: true }),
        loadExercises(),
      ])
      if (sRes.error) throw sRes.error
      if (rRes.error) throw rRes.error
      if (!sRes.data) {
        setError('Sessie niet gevonden.')
        setRows([])
        return
      }
      setSessionStatus(sRes.data.status)
      setSessionClientId(sRes.data.client_id)
      const list = rRes.data || []
      setRows(list)
      rebuildFieldsAndMeta(list)
    } catch (e) {
      setError(e?.message || 'Kon sessie niet laden.')
    } finally {
      setLoading(false)
    }
  }, [sessionId, loadExercises, rebuildFieldsAndMeta])

  useEffect(() => {
    void load()
  }, [load])

  const persistRow = useCallback(async (rowId) => {
    const f = fieldsRef.current[rowId]
    if (!f) return
    const weight = parseNum(f.weight)
    const reps = parseNum(f.reps)
    const isTopset = rowMetaRef.current[rowId]?.isTopset ?? false
    let estimated_1rm = null
    if (isTopset && weight != null && reps != null) {
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
    const exercises = groupRowsIntoExercises(rows)
    const map = new Map()
    for (const ex of exercises) {
      const key = normalizeBlockKey(ex.block)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ex)
    }
    const keys = [...map.keys()].sort((a, b) => blockSortKey(a) - blockSortKey(b))
    return keys.map((k) => ({ key: k, title: blockHeading(k), exercises: map.get(k) }))
  }, [rows])

  const filteredSwapExercises = useMemo(() => {
    const q = swapSearch.trim().toLowerCase()
    return allExercises
      .filter((ex) => {
        if (!swapTarget) return false
        if (ex.id === swapTarget.exercise_id) return false
        if (!q) return true
        return `${ex.name} ${ex.category ?? ''}`.toLowerCase().includes(q)
      })
      .slice(0, 30)
  }, [allExercises, swapSearch, swapTarget])

  async function getAdvisedWeightForExercise(newExerciseId, targetReps) {
    if (!sessionClientId) return null
    const { data, error: viewErr } = await supabase
      .from('last_1rm_per_client_exercise')
      .select('last_1rm')
      .eq('client_id', sessionClientId)
      .eq('exercise_id', newExerciseId)
      .maybeSingle()

    if (viewErr) {
      // Als de view niet bestaat of faalt, blokkeer de wissel niet.
      return null
    }

    return advisedWeightFromOneRm(data?.last_1rm, targetReps)
  }

  async function handleSwapExercise(newExercise) {
    if (!swapTarget || !newExercise || swapping) return
    setSwapping(true)
    setSaveError('')
    try {
      // Stop openstaande autosaves voor deze oefening, anders kan een oude save
      // direct na het wisselen weer data over de nieuwe oefening heen schrijven.
      for (const rowId of swapTarget.sets.map((r) => r.id)) {
        if (timersRef.current[rowId]) clearTimeout(timersRef.current[rowId])
        delete timersRef.current[rowId]
      }

      const rowIds = swapTarget.sets.map((r) => r.id).filter(Boolean)
      if (rowIds.length === 0) throw new Error('Geen sets gevonden om te wisselen.')

      const advisedWeight = await getAdvisedWeightForExercise(
        newExercise.id,
        swapTarget.target_reps,
      )

      const { data: updatedRows, error: updateErr } = await supabase
        .from('session_exercises')
        .update({
          exercise_id: newExercise.id,
          exercise_name: newExercise.name,
          advised_weight: advisedWeight,
          weight_done: null,
          reps_done: null,
          estimated_1rm: null,
        })
        .in('id', rowIds)
        .select('id')

      if (updateErr) throw updateErr
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Supabase heeft geen rijen aangepast. Check RLS-policy of kolomnamen.')
      }

      setSwapTarget(null)
      setSwapSearch('')

      // Belangrijk: altijd opnieuw laden vanuit Supabase. Dan zie je meteen zeker
      // de echte opgeslagen oefening in plaats van alleen lokale browser-state.
      await load()
    } catch (e) {
      setSaveError(e?.message || 'Oefening wisselen mislukt.')
    } finally {
      setSwapping(false)
    }
  }

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

        <div className="space-y-4">
          {grouped.map((group) => {
            const isBlockA = group.key === 'A'
            return (
              <section
                key={group.key}
                className={
                  isBlockA
                    ? 'rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-2 shadow-sm'
                    : 'rounded-xl border border-sky-200/90 bg-sky-50/60 p-2 shadow-sm'
                }
              >
                <h2 className="mb-2 px-1 text-base font-semibold text-slate-900">{group.title}</h2>
                <ul className="divide-y divide-slate-200/80">
                  {group.exercises.map((ex) => {
                    const hasAdvice =
                      ex.advised_weight != null && Number.isFinite(Number(ex.advised_weight))
                    const topsetRow = ex.sets[ex.sets.length - 1]
                    const topsetFields = topsetRow ? fields[topsetRow.id] : null
                    const tw = topsetFields ? parseNum(topsetFields.weight) : null
                    const tr = topsetFields ? parseNum(topsetFields.reps) : null
                    const showE1 =
                      tw != null && tr != null ? computeEstimatedOneRm(tw, tr).toFixed(1) : null

                    return (
                      <li key={ex.key} className="px-1 py-2">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{ex.name}</p>
                            <p className="text-xs text-slate-400">
                              Doel: {ex.target_reps ?? '—'} reps ·{' '}
                              {hasAdvice
                                ? `Advies topset: ${Number(ex.advised_weight)} kg`
                                : 'Advies topset: —'}
                              {showE1 != null ? (
                                <span className="text-slate-500"> · e1RM {showE1}</span>
                              ) : null}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isDone}
                            onClick={() => {
                              setSwapTarget(ex)
                              setSwapSearch('')
                            }}
                            className="min-h-[34px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                          >
                            Wissel
                          </button>
                        </div>
                        <ul className="space-y-1">
                          {ex.sets.map((row) => {
                            const f = fields[row.id] || { weight: '', reps: '' }
                            const setNum = Number(row.set_number) || 1
                            const isTopset = isTopsetRow(row, ex.sets)

                            return (
                              <li
                                key={row.id}
                                className={`flex max-h-[44px] items-center gap-2 rounded-lg px-1 py-0.5 ${
                                  isTopset ? 'border-2 border-emerald-500 bg-white/60' : ''
                                }`}
                              >
                                <span className="w-12 shrink-0 text-xs font-medium text-slate-600">
                                  Set {setNum}
                                </span>
                                <input
                                  id={`w-${row.id}`}
                                  type="number"
                                  inputMode="decimal"
                                  step="0.5"
                                  min="0"
                                  disabled={isDone}
                                  placeholder="kg"
                                  aria-label={`Gewicht set ${setNum} ${ex.name}`}
                                  value={f.weight}
                                  onChange={(e) => updateField(row.id, 'weight', e.target.value)}
                                  className="h-9 min-h-0 w-[4.25rem] max-h-[36px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                                />
                                <input
                                  id={`r-${row.id}`}
                                  type="number"
                                  inputMode="numeric"
                                  step="1"
                                  min="0"
                                  disabled={isDone}
                                  placeholder="reps"
                                  aria-label={`Herhalingen set ${setNum} ${ex.name}`}
                                  value={f.reps}
                                  onChange={(e) => updateField(row.id, 'reps', e.target.value)}
                                  className="h-9 min-h-0 w-[4.25rem] max-h-[36px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                                />
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </div>

      {swapTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-3 pb-3 sm:items-center sm:pb-0">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Oefening wisselen</h3>
                <p className="text-sm text-slate-500">Nu: {swapTarget.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSwapTarget(null)
                  setSwapSearch('')
                }}
                className="rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                Sluiten
              </button>
            </div>

            <input
              autoFocus
              type="text"
              value={swapSearch}
              onChange={(e) => setSwapSearch(e.target.value)}
              placeholder="Zoek oefening, bijv. deadlift, row, squat..."
              className="mb-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />

            <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-100">
              {filteredSwapExercises.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">Geen oefeningen gevonden.</p>
              ) : (
                filteredSwapExercises.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    disabled={swapping}
                    onClick={() => void handleSwapExercise(ex)}
                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-3 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="font-medium text-slate-900">{ex.name}</span>
                    <span className="text-xs text-slate-400">{ex.category ?? ''}</span>
                  </button>
                ))
              )}
            </div>

            {swapping ? <p className="mt-3 text-sm text-slate-500">Wisselen…</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
