import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Squat', 'Hinge', 'Push', 'Pull', 'Core', 'Carry', 'Cardio', 'Mobility', 'Other']
const TEMPLATE_TYPES = ['Full Body', 'Upper', 'Lower', 'Small Group', 'Rehab', 'Hyrox', 'Other']
const BLOCKS = ['Block A', 'Block B']

function emptyTemplateExercise(block = 'Block A', sortOrder = 1) {
  return {
    localId: crypto.randomUUID(),
    id: null,
    exercise_id: '',
    block,
    sort_order: sortOrder,
    sets: 3,
    target_reps: 10,
    rest_sec: 90,
  }
}

function valueOrNull(value) {
  if (value === '' || value == null) return null
  return value
}

function numberOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function Manage() {
  const [tab, setTab] = useState('exercises')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [exercises, setExercises] = useState([])
  const [templates, setTemplates] = useState([])
  const [templateRows, setTemplateRows] = useState([])

  const [exerciseForm, setExerciseForm] = useState({ id: null, name: '', category: 'Other', equipmentText: '', video_url: '' })
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [exerciseEditOpen, setExerciseEditOpen] = useState(false)

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateForm, setTemplateForm] = useState({ name: '', type: 'Full Body', duration_min: 60, notes: '' })
  const [templateExercises, setTemplateExercises] = useState([])
  const [savingTemplate, setSavingTemplate] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [eRes, tRes, teRes] = await Promise.all([
        supabase.from('exercises').select('id, name, category, equipment, video_url').order('name'),
        supabase.from('workout_templates').select('id, name, type, duration_min, notes').order('name'),
        supabase
          .from('template_exercises')
          .select('id, workout_template_id, exercise_id, block, sort_order, sets, target_reps, rest_sec')
          .order('block', { ascending: true })
          .order('sort_order', { ascending: true }),
      ])
      if (eRes.error) throw eRes.error
      if (tRes.error) throw tRes.error
      if (teRes.error) throw teRes.error
      setExercises(eRes.data || [])
      setTemplates(tRes.data || [])
      setTemplateRows(teRes.data || [])
    } catch (e) {
      setError(e?.message || 'Kon beheerdata niet laden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const filteredExercises = useMemo(() => {
    const q = exerciseSearch.trim().toLowerCase()
    if (!q) return exercises
    return exercises.filter((ex) => `${ex.name} ${ex.category ?? ''}`.toLowerCase().includes(q))
  }, [exercises, exerciseSearch])

  const exerciseNameById = useMemo(() => {
    const map = new Map()
    for (const ex of exercises) map.set(ex.id, ex.name)
    return map
  }, [exercises])

  function resetExerciseForm() {
    setExerciseForm({ id: null, name: '', category: 'Other', equipmentText: '', video_url: '' })
    setExerciseEditOpen(false)
  }

  function editExercise(ex) {
    const equipmentText = Array.isArray(ex.equipment) ? ex.equipment.join(', ') : ''
    setExerciseForm({
      id: ex.id,
      name: ex.name || '',
      category: ex.category || 'Other',
      equipmentText,
      video_url: ex.video_url || '',
    })
    setTab('exercises')
    setExerciseEditOpen(true)
  }

  async function saveExercise(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    const name = exerciseForm.name.trim()
    if (!name) {
      setError('Vul een oefeningnaam in.')
      return
    }

    const equipment = exerciseForm.equipmentText
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)

    const payload = {
      name,
      category: valueOrNull(exerciseForm.category),
      equipment: equipment.length ? equipment : null,
      video_url: valueOrNull(exerciseForm.video_url.trim()),
    }

    try {
      const query = exerciseForm.id
        ? supabase.from('exercises').update(payload).eq('id', exerciseForm.id)
        : supabase.from('exercises').insert(payload)
      const { error: sErr } = await query
      if (sErr) throw sErr
      resetExerciseForm()
      setNotice(exerciseForm.id ? 'Oefening aangepast.' : 'Oefening toegevoegd.')
      await loadAll()
    } catch (e) {
      setError(e?.message || 'Oefening opslaan mislukt.')
    }
  }

  function startNewTemplate() {
    setSelectedTemplateId('')
    setTemplateForm({ name: '', type: 'Full Body', duration_min: 60, notes: '' })
    setTemplateExercises([
      emptyTemplateExercise('Block A', 1),
      emptyTemplateExercise('Block A', 2),
      emptyTemplateExercise('Block A', 3),
      emptyTemplateExercise('Block A', 4),
      emptyTemplateExercise('Block B', 1),
      emptyTemplateExercise('Block B', 2),
      emptyTemplateExercise('Block B', 3),
      emptyTemplateExercise('Block B', 4),
    ])
    setTab('templates')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function selectTemplate(id) {
    const t = templates.find((tpl) => tpl.id === id)
    if (!t) return
    const rows = templateRows
      .filter((row) => row.workout_template_id === id)
      .sort((a, b) => String(a.block).localeCompare(String(b.block)) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((row) => ({
        localId: crypto.randomUUID(),
        id: row.id,
        exercise_id: row.exercise_id || '',
        block: row.block || 'Block A',
        sort_order: row.sort_order ?? 1,
        sets: row.sets ?? 3,
        target_reps: row.target_reps ?? 10,
        rest_sec: row.rest_sec ?? 90,
      }))

    setSelectedTemplateId(id)
    setTemplateForm({
      name: t.name || '',
      type: t.type || 'Full Body',
      duration_min: t.duration_min ?? 60,
      notes: t.notes || '',
    })
    setTemplateExercises(rows.length ? rows : [emptyTemplateExercise('Block A', 1), emptyTemplateExercise('Block B', 1)])
    setTab('templates')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function addTemplateExercise(block) {
    const existing = templateExercises.filter((row) => row.block === block)
    const nextOrder = existing.length ? Math.max(...existing.map((row) => Number(row.sort_order) || 0)) + 1 : 1
    setTemplateExercises((prev) => [...prev, emptyTemplateExercise(block, nextOrder)])
  }

  function updateTemplateExercise(localId, field, value) {
    setTemplateExercises((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, [field]: value } : row)),
    )
  }

  function removeTemplateExercise(localId) {
    setTemplateExercises((prev) => prev.filter((row) => row.localId !== localId))
  }

  async function saveTemplate(e) {
    e.preventDefault()
    if (savingTemplate) return
    setSavingTemplate(true)
    setError('')
    setNotice('')

    const name = templateForm.name.trim()
    if (!name) {
      setError('Vul een templatenaam in.')
      setSavingTemplate(false)
      return
    }

    const validRows = templateExercises
      .filter((row) => row.exercise_id)
      .map((row, idx) => ({
        id: row.id,
        exercise_id: row.exercise_id,
        block: row.block || 'Block A',
        sort_order: numberOrNull(row.sort_order) ?? idx + 1,
        sets: numberOrNull(row.sets) ?? 3,
        target_reps: numberOrNull(row.target_reps) ?? 10,
        rest_sec: numberOrNull(row.rest_sec) ?? 90,
      }))

    if (!validRows.length) {
      setError('Voeg minimaal één oefening toe aan de template.')
      setSavingTemplate(false)
      return
    }

    try {
      let templateId = selectedTemplateId
      const templatePayload = {
        name,
        type: templateForm.type || null,
        duration_min: numberOrNull(templateForm.duration_min),
        notes: valueOrNull(templateForm.notes.trim()),
      }

      if (templateId) {
        const { error: tErr } = await supabase.from('workout_templates').update(templatePayload).eq('id', templateId)
        if (tErr) throw tErr
      } else {
        const { data: inserted, error: tErr } = await supabase
          .from('workout_templates')
          .insert(templatePayload)
          .select('id')
          .single()
        if (tErr) throw tErr
        templateId = inserted.id
        setSelectedTemplateId(templateId)
      }

      // Simpel en betrouwbaar: oude template-regels weg, nieuwe regels erin.
      const { error: delErr } = await supabase.from('template_exercises').delete().eq('workout_template_id', templateId)
      if (delErr) throw delErr

      const rowsPayload = validRows.map((row) => ({
        workout_template_id: templateId,
        exercise_id: row.exercise_id,
        block: row.block,
        sort_order: row.sort_order,
        sets: row.sets,
        target_reps: row.target_reps,
        rest_sec: row.rest_sec,
      }))

      const { error: rErr } = await supabase.from('template_exercises').insert(rowsPayload)
      if (rErr) throw rErr

      setNotice('Template opgeslagen.')
      await loadAll()
    } catch (e) {
      setError(e?.message || 'Template opslaan mislukt.')
    } finally {
      setSavingTemplate(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Beheer</h1>
        <p className="mt-1 text-sm text-slate-600">Oefeningen en trainingstemplates beheren zonder Supabase.</p>
      </div>

      <div className="mb-5 flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab('exercises')}
          className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm font-medium ${tab === 'exercises' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Oefeningen
        </button>
        <button
          type="button"
          onClick={() => setTab('templates')}
          className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm font-medium ${tab === 'templates' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Templates
        </button>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {notice ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      {loading ? <p className="text-center text-sm text-slate-500">Laden…</p> : null}

      {!loading && tab === 'exercises' ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{exerciseForm.id ? 'Oefening aanpassen' : 'Nieuwe oefening'}</h2>
            <form onSubmit={saveExercise} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Naam</label>
                <input
                  value={exerciseForm.name}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Bijv. Back Squat"
                  className="w-full min-h-[46px] rounded-xl border border-slate-200 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Categorie</label>
                <select
                  value={exerciseForm.category}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full min-h-[46px] rounded-xl border border-slate-200 bg-white px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                >
                  {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Equipment</label>
                <input
                  value={exerciseForm.equipmentText}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, equipmentText: e.target.value }))}
                  placeholder="Bijv. barbell, dumbbell"
                  className="w-full min-h-[46px] rounded-xl border border-slate-200 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Video URL optioneel</label>
                <input
                  value={exerciseForm.video_url}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, video_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full min-h-[46px] rounded-xl border border-slate-200 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="min-h-[46px] flex-1 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
                  {exerciseForm.id ? 'Aanpassen' : 'Toevoegen'}
                </button>
                {exerciseForm.id ? (
                  <button type="button" onClick={resetExerciseForm} className="min-h-[46px] rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Annuleren
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Oefeningen</h2>
              <span className="text-xs text-slate-500">{filteredExercises.length} stuks</span>
            </div>
            <input
              value={exerciseSearch}
              onChange={(e) => setExerciseSearch(e.target.value)}
              placeholder="Zoeken..."
              className="mb-3 w-full min-h-[42px] rounded-xl border border-slate-200 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
            <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
              {filteredExercises.map((ex) => (
                <li key={ex.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{ex.name}</p>
                    <p className="text-xs text-slate-500">{ex.category || 'Geen categorie'}</p>
                  </div>
                  <button type="button" onClick={() => editExercise(ex)} className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    Bewerk
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {!loading && tab === 'templates' ? (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <button type="button" onClick={startNewTemplate} className="mb-3 w-full min-h-[44px] rounded-xl bg-slate-900 text-sm font-medium text-white hover:bg-slate-800">
              + Nieuwe template
            </button>
            <ul className="space-y-1">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => selectTemplate(t.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedTemplateId === t.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span className="block font-medium">{t.name}</span>
                    <span className="text-xs opacity-70">{t.type || 'Geen type'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{selectedTemplateId ? 'Template aanpassen' : 'Nieuwe template'}</h2>
            <form onSubmit={saveTemplate} className="mt-4 space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Naam</label>
                  <input
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Full Body A"
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
                  <select
                    value={templateForm.type}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    {TEMPLATE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Minuten</label>
                  <input
                    type="number"
                    value={templateForm.duration_min}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, duration_min: e.target.value }))}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
              </div>

              {BLOCKS.map((block) => {
                const rows = templateExercises
                  .filter((row) => row.block === block)
                  .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
                return (
                  <section key={block} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900">{block}</h3>
                      <button type="button" onClick={() => addTemplateExercise(block)} className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        + Oefening
                      </button>
                    </div>
                    <div className="space-y-2">
                      {rows.map((row) => (
                        <div key={row.localId} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_4rem_2.5rem] gap-2 rounded-lg bg-white p-2 shadow-sm">
                          <select
                            value={row.exercise_id}
                            onChange={(e) => updateTemplateExercise(row.localId, 'exercise_id', e.target.value)}
                            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          >
                            <option value="">Kies oefening</option>
                            {exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                          </select>
                          <input
                            type="number"
                            value={row.sets}
                            title="Sets"
                            onChange={(e) => updateTemplateExercise(row.localId, 'sets', e.target.value)}
                            className="min-h-[40px] rounded-lg border border-slate-200 px-2 text-sm"
                          />
                          <input
                            type="number"
                            value={row.target_reps}
                            title="Reps"
                            onChange={(e) => updateTemplateExercise(row.localId, 'target_reps', e.target.value)}
                            className="min-h-[40px] rounded-lg border border-slate-200 px-2 text-sm"
                          />
                          <input
                            type="number"
                            value={row.sort_order}
                            title="Volgorde"
                            onChange={(e) => updateTemplateExercise(row.localId, 'sort_order', e.target.value)}
                            className="min-h-[40px] rounded-lg border border-slate-200 px-2 text-sm"
                          />
                          <button type="button" onClick={() => removeTemplateExercise(row.localId)} className="min-h-[40px] rounded-lg text-sm font-bold text-red-500 hover:bg-red-50" title="Verwijder">
                            ×
                          </button>
                        </div>
                      ))}
                      {!rows.length ? <p className="text-sm text-slate-500">Nog geen oefeningen in dit blok.</p> : null}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Velden: oefening · sets · reps · volgorde</p>
                  </section>
                )
              })}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notities optioneel</label>
                <textarea
                  rows={3}
                  value={templateForm.notes}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              <button type="submit" disabled={savingTemplate} className="w-full min-h-[48px] rounded-xl bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {savingTemplate ? 'Opslaan…' : 'Template opslaan'}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {exerciseEditOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 px-3 pb-3 sm:items-center sm:pb-0">
          <section className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Oefening bewerken</h2>
                <p className="mt-1 text-sm text-slate-500">Pas naam, categorie, equipment of video aan.</p>
              </div>
              <button
                type="button"
                onClick={resetExerciseForm}
                className="rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                Sluiten
              </button>
            </div>

            <form onSubmit={saveExercise} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Naam</label>
                <input
                  autoFocus
                  value={exerciseForm.name}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full min-h-[46px] rounded-xl border border-slate-200 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Categorie</label>
                <select
                  value={exerciseForm.category}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full min-h-[46px] rounded-xl border border-slate-200 bg-white px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                >
                  {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Equipment</label>
                <input
                  value={exerciseForm.equipmentText}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, equipmentText: e.target.value }))}
                  placeholder="Bijv. barbell, dumbbell"
                  className="w-full min-h-[46px] rounded-xl border border-slate-200 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Video URL optioneel</label>
                <input
                  value={exerciseForm.video_url}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, video_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full min-h-[46px] rounded-xl border border-slate-200 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="min-h-[46px] flex-1 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Opslaan
                </button>
                <button
                  type="button"
                  onClick={resetExerciseForm}
                  className="min-h-[46px] rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Annuleren
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

    </main>
  )
}
