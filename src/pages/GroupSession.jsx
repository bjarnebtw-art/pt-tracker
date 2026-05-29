import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Check, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchLatestOneRmByExercise } from '../lib/oneRm'
import {
  computeAdvisedWeight,
  computeEstimatedOneRm,
  defaultSetWeight,
} from '../lib/trainingMath'

function todayIsoDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

function exerciseFromRow(row) {
  const ex = row.exercises
  if (ex && typeof ex === 'object' && !Array.isArray(ex)) {
    return { id: ex.id, name: ex.name ?? 'Oefening', category: ex.category ?? null }
  }
  if (Array.isArray(ex) && ex[0]) {
    return { id: ex[0].id, name: ex[0].name ?? 'Oefening', category: ex[0].category ?? null }
  }
  return { id: row.exercise_id, name: 'Oefening', category: null }
}

function parseNum(s) {
  if (s === '' || s == null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function progressiveWeights(advisedWeight, totalSets = 3) {
  if (advisedWeight == null || !Number.isFinite(Number(advisedWeight))) {
    return [null, null, null]
  }
  const w = Number(advisedWeight)
  return Array.from({ length: totalSets }, (_, i) => defaultSetWeight(w, i + 1, totalSets))
}

function formatWeight(w) {
  if (w == null || !Number.isFinite(w)) return '—'
  return String(w)
}

/**
 * @param {object[]} templateRows
 * @returns {object[]}
 */
function groupTemplateByBlock(templateRows) {
  const map = new Map()
  for (const row of templateRows) {
    const key = normalizeBlockKey(row.block)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id)))
  }
  const keys = [...map.keys()].sort((a, b) => blockSortKey(a) - blockSortKey(b))
  return keys.map((key) => {
    const exercises = map.get(key)
    const rounds = exercises.length
      ? Math.max(...exercises.map((e) => Math.max(1, Number(e.sets) || 3)))
      : 3
    return {
      key,
      title: blockHeading(key),
      rounds,
      exercises: exercises.map((row, idx) => {
        const ex = exerciseFromRow(row)
        return {
          slotKey: `${key}-${row.sort_order ?? idx}-${row.exercise_id}`,
          templateRowId: row.id,
          exerciseId: ex.id,
          name: ex.name,
          category: ex.category,
          targetReps: Number(row.target_reps),
          totalSets: Math.max(1, Number(row.sets) || 3),
          sortOrder: row.sort_order ?? idx,
          block: row.block,
        }
      }),
    }
  })
}

export default function GroupSession() {
  const [clients, setClients] = useState([])
  const [templates, setTemplates] = useState([])
  const [allExercises, setAllExercises] = useState([])
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [templateId, setTemplateId] = useState('')
  const [loadingLists, setLoadingLists] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')

  const [started, setStarted] = useState(false)
  const [blocks, setBlocks] = useState([])
  const [activeClients, setActiveClients] = useState([])
  const [swapOpenKey, setSwapOpenKey] = useState(null)
  const [swapQuery, setSwapQuery] = useState('')
  const swapRef = useRef(null)

  const loadLists = useCallback(async () => {
    setLoadingLists(true)
    setError('')
    try {
      const [cRes, tRes, eRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('active', true).order('name'),
        supabase.from('workout_templates').select('id, name').order('name'),
        supabase.from('exercises').select('id, name, category').order('name'),
      ])
      if (cRes.error) throw cRes.error
      if (tRes.error) throw tRes.error
      if (eRes.error) throw eRes.error
      setClients(cRes.data || [])
      setTemplates(tRes.data || [])
      setAllExercises(eRes.data || [])
    } catch (e) {
      setError(e?.message || 'Kon gegevens niet laden.')
    } finally {
      setLoadingLists(false)
    }
  }, [])

  useEffect(() => {
    void loadLists()
  }, [loadLists])

  useEffect(() => {
    if (!swapOpenKey) return
    function onDocClick(e) {
      if (swapRef.current && !swapRef.current.contains(e.target)) {
        setSwapOpenKey(null)
        setSwapQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [swapOpenKey])

  const selectedCount = selectedIds.size
  const canStart = selectedCount >= 2 && selectedCount <= 4 && templateId && !starting


  function toggleClient(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      if (next.size >= 4) return prev
      next.add(id)
      return next
    })
  }

  async function handleStart() {
    if (!canStart) return
    setStarting(true)
    setError('')
    setSaveError('')
    try {
      const chosen = clients.filter((c) => selectedIds.has(c.id))
      const date = todayIsoDate()

      const { data: tEx, error: tErr } = await supabase
        .from('template_exercises')
        .select(
          `
          id,
          exercise_id,
          target_reps,
          block,
          sets,
          sort_order,
          exercises ( id, name, category )
        `,
        )
        .eq('workout_template_id', templateId)
        .order('sort_order', { ascending: true })
      if (tErr) throw tErr
      if (!tEx?.length) throw new Error('Deze template heeft geen oefeningen.')

      const blockGroups = groupTemplateByBlock(tEx)
      const oneRmByClient = new Map()
      await Promise.all(
        chosen.map(async (c) => {
          oneRmByClient.set(c.id, await fetchLatestOneRmByExercise(c.id))
        }),
      )

      const sessionByClient = new Map()
      for (const client of chosen) {
        const { data: sessionRow, error: sErr } = await supabase
          .from('sessions')
          .insert({
            client_id: client.id,
            workout_template_id: templateId,
            date,
            status: 'InProgress',
          })
          .select('id')
          .single()
        if (sErr) throw sErr
        sessionByClient.set(client.id, sessionRow.id)
      }

      const insertRows = []
      tEx.forEach((row, idx) => {
        const targetReps = Number(row.target_reps)
        const blockVal = row.block != null ? String(row.block) : 'A'
        const sortOrder = row.sort_order ?? idx
        const numSets = Math.max(1, Number(row.sets) || 3)
        for (const client of chosen) {
          const sessionId = sessionByClient.get(client.id)
          const prev = oneRmByClient.get(client.id)?.get(row.exercise_id)
          let advised_weight = null
          if (prev != null && Number.isFinite(prev) && Number.isFinite(targetReps)) {
            advised_weight = computeAdvisedWeight(prev, targetReps)
          }
          for (let setNumber = 1; setNumber <= numSets; setNumber += 1) {
            insertRows.push({
              session_id: sessionId,
              exercise_id: row.exercise_id,
              target_reps: targetReps,
              advised_weight,
              sets: numSets,
              set_number: setNumber,
              block: blockVal,
              sort_order: sortOrder,
              weight_done: null,
              reps_done: null,
              estimated_1rm: null,
            })
          }
        }
      })

      const { data: inserted, error: insErr } = await supabase
        .from('session_exercises')
        .insert(insertRows)
        .select('id, session_id, exercise_id, set_number, sort_order, block, advised_weight, sets')
      if (insErr) throw insErr

      const rowsBySessionExercise = new Map()
      for (const row of inserted || []) {
        const sess = [...sessionByClient.entries()].find(([, sid]) => sid === row.session_id)
        const clientId = sess?.[0]
        if (!clientId) continue
        const key = `${clientId}-${row.sort_order}-${row.exercise_id}`
        if (!rowsBySessionExercise.has(key)) rowsBySessionExercise.set(key, [])
        rowsBySessionExercise.get(key).push(row)
      }

      const uiBlocks = blockGroups.map((block) => ({
        ...block,
        exercises: block.exercises.map((slot) => {
          const clientState = {}
          for (const client of chosen) {
            const key = `${client.id}-${slot.sortOrder}-${slot.exerciseId}`
            const setRows = (rowsBySessionExercise.get(key) || []).sort(
              (a, b) => (Number(a.set_number) || 1) - (Number(b.set_number) || 1),
            )
            const topsetRow = setRows[setRows.length - 1]
            const advised = topsetRow?.advised_weight ?? null
            const weights = progressiveWeights(advised, slot.totalSets)
            const topsetDefault = weights[weights.length - 1]
            clientState[client.id] = {
              advisedWeight: advised,
              weights,
              topsetWeight: topsetDefault != null ? String(topsetDefault) : '',
              reps: '',
              notes: '',
              notesOpen: false,
              confirmed: false,
              topsetRowId: topsetRow?.id ?? null,
              sessionId: sessionByClient.get(client.id),
            }
          }
          return { ...slot, clients: clientState }
        }),
      }))

      setActiveClients(chosen)
      setBlocks(uiBlocks)
      setStarted(true)
    } catch (e) {
      setError(e?.message || 'Starten van de groepstraining is mislukt.')
    } finally {
      setStarting(false)
    }
  }

  async function confirmTopset(blockKey, slotKey, clientId) {
    setSaveError('')
    const block = blocks.find((b) => b.key === blockKey)
    const slot = block?.exercises.find((e) => e.slotKey === slotKey)
    const cs = slot?.clients?.[clientId]
    if (!cs?.topsetRowId) return

    const weight = parseNum(cs.topsetWeight)
    const reps = parseNum(cs.reps)
    let estimated_1rm = null
    if (weight != null && reps != null) {
      estimated_1rm = computeEstimatedOneRm(weight, reps)
    }

    try {
      const { error: uErr } = await supabase
        .from('session_exercises')
        .update({
          weight_done: weight,
          reps_done: reps,
          estimated_1rm,
        })
        .eq('id', cs.topsetRowId)
      if (uErr) throw uErr

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.key !== blockKey) return b
          return {
            ...b,
            exercises: b.exercises.map((ex) => {
              if (ex.slotKey !== slotKey) return ex
              return {
                ...ex,
                clients: {
                  ...ex.clients,
                  [clientId]: { ...ex.clients[clientId], confirmed: true },
                },
              }
            }),
          }
        }),
      )
    } catch (e) {
      setSaveError(e?.message || 'Opslaan mislukt.')
    }
  }

  function updateTopsetField(blockKey, slotKey, clientId, field, value) {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.key !== blockKey) return b
        return {
          ...b,
          exercises: b.exercises.map((ex) => {
            if (ex.slotKey !== slotKey) return ex
            const prevClient = ex.clients[clientId]
            const clearsConfirm = field === 'topsetWeight' || field === 'reps'
            return {
              ...ex,
              clients: {
                ...ex.clients,
                [clientId]: {
                  ...prevClient,
                  [field]: value,
                  ...(clearsConfirm ? { confirmed: false } : {}),
                },
              },
            }
          }),
        }
      }),
    )
  }

  async function saveNote(blockKey, slotKey, clientId, notes) {
    const block = blocks.find((b) => b.key === blockKey)
    const slot = block?.exercises.find((e) => e.slotKey === slotKey)
    const cs = slot?.clients?.[clientId]
    if (!cs?.topsetRowId) return

    try {
      const { error: uErr } = await supabase
        .from('session_exercises')
        .update({ notes: notes.trim() || null })
        .eq('id', cs.topsetRowId)
      if (uErr) throw uErr
    } catch (e) {
      setSaveError(e?.message || 'Notitie opslaan mislukt.')
    }
  }

  function toggleNotesOpen(blockKey, slotKey, clientId) {
    const block = blocks.find((b) => b.key === blockKey)
    const slot = block?.exercises.find((e) => e.slotKey === slotKey)
    const cs = slot?.clients?.[clientId]
    if (!cs) return

    const willClose = cs.notesOpen
    if (willClose) void saveNote(blockKey, slotKey, clientId, cs.notes)

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.key !== blockKey) return b
        return {
          ...b,
          exercises: b.exercises.map((ex) => {
            if (ex.slotKey !== slotKey) return ex
            return {
              ...ex,
              clients: {
                ...ex.clients,
                [clientId]: { ...ex.clients[clientId], notesOpen: !cs.notesOpen },
              },
            }
          }),
        }
      }),
    )
  }

  async function swapExercise(blockKey, slotKey, newExercise) {
    setSwapOpenKey(null)
    setSwapQuery('')
    setSaveError('')

    const block = blocks.find((b) => b.key === blockKey)
    const slot = block?.exercises.find((e) => e.slotKey === slotKey)
    if (!slot || newExercise.id === slot.exerciseId) return

    try {
      const oneRmByClient = new Map()
      await Promise.all(
        activeClients.map(async (c) => {
          oneRmByClient.set(c.id, await fetchLatestOneRmByExercise(c.id))
        }),
      )

      for (const client of activeClients) {
        const cs = slot.clients[client.id]
        if (!cs?.sessionId) continue

        const prev = oneRmByClient.get(client.id)?.get(newExercise.id)
        let advised_weight = null
        if (prev != null && Number.isFinite(prev) && Number.isFinite(slot.targetReps)) {
          advised_weight = computeAdvisedWeight(prev, slot.targetReps)
        }

        // Belangrijk: wissel op positie binnen het blok, niet op oude exercise_id.
        // Daardoor werkt dit ook als de oude oefening al eens gewisseld is.
        let query = supabase
          .from('session_exercises')
          .update({
            exercise_id: newExercise.id,
            advised_weight,
            weight_done: null,
            reps_done: null,
            estimated_1rm: null,
            notes: null,
          })
          .eq('session_id', cs.sessionId)
          .eq('sort_order', slot.sortOrder)

        if (slot.block != null) {
          query = query.eq('block', String(slot.block))
        }

        const { error: uErr } = await query
        if (uErr) throw uErr
      }

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.key !== blockKey) return b
          return {
            ...b,
            exercises: b.exercises.map((ex) => {
              if (ex.slotKey !== slotKey) return ex

              const nextClients = {}
              for (const client of activeClients) {
                const prevOneRm = oneRmByClient.get(client.id)?.get(newExercise.id)
                let advised = null
                if (prevOneRm != null && Number.isFinite(prevOneRm) && Number.isFinite(ex.targetReps)) {
                  advised = computeAdvisedWeight(prevOneRm, ex.targetReps)
                }
                const weights = progressiveWeights(advised, ex.totalSets)
                const topsetDefault = weights[weights.length - 1]
                const old = ex.clients[client.id]
                nextClients[client.id] = {
                  advisedWeight: advised,
                  weights,
                  topsetWeight: topsetDefault != null ? String(topsetDefault) : '',
                  reps: '',
                  notes: '',
                  notesOpen: false,
                  confirmed: false,
                  topsetRowId: old?.topsetRowId,
                  sessionId: old?.sessionId,
                }
              }

              return {
                ...ex,
                slotKey: `${ex.block ?? blockKey}-${ex.sortOrder}-${newExercise.id}`,
                exerciseId: newExercise.id,
                name: newExercise.name,
                category: newExercise.category,
                clients: nextClients,
              }
            }),
          }
        }),
      )
    } catch (e) {
      setSaveError(e?.message || 'Wisselen mislukt.')
    }
  }

  if (!started) {
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

        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Groepstraining</h1>
        <p className="mt-1 text-slate-600 text-sm">1-op-4 overzicht — kies 2 tot 4 klanten.</p>

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
            <fieldset>
              <legend className="block text-sm font-medium text-slate-700 mb-2">
                Klanten ({selectedCount}/4)
              </legend>
              <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 shadow-sm overflow-hidden">
                {clients.map((c) => {
                  const checked = selectedIds.has(c.id)
                  const disabled = !checked && selectedCount >= 4
                  return (
                    <li key={c.id}>
                      <label
                        className={`flex min-h-[48px] items-center gap-3 px-4 py-3 cursor-pointer ${
                          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleClient(c.id)}
                          className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                        />
                        <span className="text-base font-medium text-slate-900">{c.name}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>

            <div>
              <label
                htmlFor="gs-template"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Workout template
              </label>
              <select
                id="gs-template"
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

            <button
              type="button"
              disabled={!canStart}
              onClick={() => void handleStart()}
              className="w-full min-h-[52px] rounded-xl bg-slate-900 text-base font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {starting ? 'Bezig…' : 'Start groepstraining'}
            </button>
          </div>
        )}
      </main>
    )
  }

  return (
    <div className="min-h-svh w-full bg-slate-100 text-left">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] inline-flex items-center"
          >
            ← Overzicht
          </Link>
          <p className="text-sm font-medium text-slate-700">
            {activeClients.map((c) => c.name).join(' · ')}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {saveError ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {saveError}
          </div>
        ) : null}

        <div className="space-y-6">
          {blocks.map((block) => {
            const isBlockA = block.key === 'A'
            return (
              <section
                key={block.key}
                className={
                  isBlockA
                    ? 'rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 shadow-sm'
                    : 'rounded-xl border border-sky-200/90 bg-sky-50/60 p-3 shadow-sm'
                }
              >
                <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
                  <h2 className="text-base font-semibold text-slate-900">{block.title}</h2>
                  <span className="text-sm text-slate-600">
                    {block.rounds} {block.rounds === 1 ? 'ronde' : 'rondes'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {block.exercises.map((slot) => {
                    const swapOpen = swapOpenKey === slot.slotKey
                    const q = swapOpen ? swapQuery.trim().toLowerCase() : ''
                    const alts = allExercises
                      .filter((ex) => ex.id !== slot.exerciseId)
                      .filter((ex) => !q || ex.name.toLowerCase().includes(q))

                    return (
                      <article
                        key={slot.slotKey}
                        className="relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <div className="pr-8">
                          <h3 className="text-sm font-bold text-slate-900 leading-tight">
                            {slot.name}
                          </h3>
                          {Number.isFinite(slot.targetReps) ? (
                            <p className="mt-0.5 text-xs text-slate-500">
                              Doel: {slot.targetReps} reps
                            </p>
                          ) : null}
                        </div>

                        {alts.length > 0 ? (
                          <div className="absolute right-2 top-2" ref={swapRef}>
                            <button
                              type="button"
                              title="Oefening wisselen"
                              aria-expanded={swapOpen}
                              onClick={() => {
                                setSwapOpenKey((k) => {
                                  const next = k === slot.slotKey ? null : slot.slotKey
                                  if (!next) setSwapQuery('')
                                  return next
                                })
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                            >
                              <ArrowLeftRight className="h-4 w-4" aria-hidden />
                            </button>
                            {swapOpen ? (
                              <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg">
                                <input
                                  type="text"
                                  autoFocus
                                  value={swapQuery}
                                  onChange={(e) => setSwapQuery(e.target.value)}
                                  placeholder="Zoek oefening..."
                                  className="mb-2 h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                />
                                <ul role="listbox" className="max-h-56 overflow-y-auto">
                                  {alts.map((alt) => (
                                    <li key={alt.id}>
                                      <button
                                        type="button"
                                        role="option"
                                        className="w-full rounded-md px-3 py-2 text-left text-slate-800 hover:bg-slate-50"
                                        onClick={() =>
                                          void swapExercise(block.key, slot.slotKey, alt)
                                        }
                                      >
                                        <span className="block font-medium">{alt.name}</span>
                                        {alt.category ? (
                                          <span className="block text-xs text-slate-400">{alt.category}</span>
                                        ) : null}
                                      </button>
                                    </li>
                                  ))}
                                  {alts.length === 0 ? (
                                    <li className="px-3 py-2 text-slate-500">Geen oefening gevonden.</li>
                                  ) : null}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <ul className="mt-3 space-y-2">
                          {activeClients.map((client) => {
                            const cs = slot.clients[client.id]
                            if (!cs) return null
                            const buildupWeights = cs.weights.slice(0, -1)
                            const confirmed = cs.confirmed

                            return (
                              <li
                                key={client.id}
                                className={`rounded-md border px-2 py-1.5 ${
                                  confirmed
                                    ? 'border-emerald-300 bg-emerald-50/80'
                                    : 'border-slate-100 bg-slate-50/50'
                                }`}
                              >
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                                  <span className="min-w-[4.5rem] font-medium text-slate-800 shrink-0">
                                    {client.name}
                                  </span>
                                  {buildupWeights.length > 0 ? (
                                    <span className="inline-flex items-center gap-2 text-base tabular-nums text-slate-600">
                                      {buildupWeights.map((w, i) => (
                                        <span key={i} className="inline-flex items-center">
                                          {i > 0 ? (
                                            <span className="mr-2 text-slate-300">·</span>
                                          ) : null}
                                          {formatWeight(w)}
                                        </span>
                                      ))}
                                      <span className="text-slate-300">·</span>
                                    </span>
                                  ) : null}
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.5"
                                    min="0"
                                    disabled={confirmed}
                                    aria-label={`Topset gewicht ${client.name} ${slot.name}`}
                                    value={cs.topsetWeight}
                                    onChange={(e) =>
                                      updateTopsetField(
                                        block.key,
                                        slot.slotKey,
                                        client.id,
                                        'topsetWeight',
                                        e.target.value,
                                      )
                                    }
                                    className="h-8 max-w-[60px] w-full rounded border border-slate-200 bg-white px-1.5 text-sm font-bold text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                                  />
                                  <span className="text-slate-400 text-[10px]">kg</span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    step="1"
                                    min="0"
                                    disabled={confirmed}
                                    placeholder="reps"
                                    aria-label={`Topset reps ${client.name} ${slot.name}`}
                                    value={cs.reps}
                                    onChange={(e) =>
                                      updateTopsetField(
                                        block.key,
                                        slot.slotKey,
                                        client.id,
                                        'reps',
                                        e.target.value,
                                      )
                                    }
                                    className="h-8 max-w-[50px] w-full rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                                  />
                                  <button
                                    type="button"
                                    title={cs.notesOpen ? 'Notitie sluiten' : 'Notitie toevoegen'}
                                    onClick={() =>
                                      toggleNotesOpen(block.key, slot.slotKey, client.id)
                                    }
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
                                      cs.notesOpen || cs.notes
                                        ? 'bg-slate-200 text-slate-800'
                                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                    }`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    title="Topset bevestigen"
                                    disabled={confirmed}
                                    onClick={() =>
                                      void confirmTopset(block.key, slot.slotKey, client.id)
                                    }
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-60 ${
                                      confirmed
                                        ? 'bg-emerald-600 text-white'
                                        : 'border border-emerald-500 text-emerald-600 hover:bg-emerald-50'
                                    }`}
                                  >
                                    <Check className="h-4 w-4" aria-hidden />
                                  </button>
                                </div>
                                {cs.notesOpen ? (
                                  <textarea
                                    rows={2}
                                    placeholder="Notitie bijv. voetboog, kniepijn..."
                                    aria-label={`Notitie ${client.name} ${slot.name}`}
                                    value={cs.notes}
                                    onChange={(e) =>
                                      updateTopsetField(
                                        block.key,
                                        slot.slotKey,
                                        client.id,
                                        'notes',
                                        e.target.value,
                                      )
                                    }
                                    onBlur={(e) =>
                                      void saveNote(
                                        block.key,
                                        slot.slotKey,
                                        client.id,
                                        e.target.value,
                                      )
                                    }
                                    className="mt-1.5 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                  />
                                ) : null}
                              </li>
                            )
                          })}
                        </ul>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
