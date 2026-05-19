import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabase'

const CHART_BLUE = '#3B82F6'

const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function formatChartDay(isoDate) {
  const parts = String(isoDate).split('-')
  if (parts.length !== 3) return String(isoDate)
  const d = Number(parts[2])
  const m = Number(parts[1])
  if (!d || !m || m < 1 || m > 12) return String(isoDate)
  return `${d} ${MONTHS_NL[m - 1]}`
}

function formatTableDate(isoDate) {
  try {
    return new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${isoDate}T12:00:00`))
  } catch {
    return String(isoDate)
  }
}

function formatKg(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Number(n).toFixed(1)} kg`
}

function formatPct(first, last) {
  if (first == null || last == null || !Number.isFinite(first) || !Number.isFinite(last)) return '—'
  if (first <= 0) return '—'
  const pct = ((last - first) / first) * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

async function fetchClientName(clientId) {
  const { data, error } = await supabase.from('clients').select('id, name').eq('id', clientId).maybeSingle()
  if (error) throw error
  return data
}

async function fetchLoggedExercises(clientId) {
  const { data, error } = await supabase
    .from('session_exercises')
    .select(
      `
      exercise_id,
      sessions!inner ( client_id ),
      exercises ( id, name )
    `,
    )
    .eq('sessions.client_id', clientId)

  if (error) throw error

  const byId = new Map()
  for (const row of data || []) {
    const ex = row.exercises
    const name =
      ex && typeof ex === 'object' && !Array.isArray(ex)
        ? ex.name ?? 'Oefening'
        : Array.isArray(ex) && ex[0]
          ? ex[0].name ?? 'Oefening'
          : 'Oefening'
    if (row.exercise_id && !byId.has(row.exercise_id)) {
      byId.set(row.exercise_id, { id: row.exercise_id, name })
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'))
}

async function fetchProgressSeries(clientId, exerciseId) {
  const { data, error } = await supabase
    .from('session_exercises')
    .select(
      `
      estimated_1rm,
      weight_done,
      reps_done,
      target_reps,
      sessions!inner ( date, client_id )
    `,
    )
    .eq('sessions.client_id', clientId)
    .eq('exercise_id', exerciseId)
    .not('estimated_1rm', 'is', null)

  if (error) throw error

  const rows = []
  for (const row of data || []) {
    const sess = row.sessions
    const date = Array.isArray(sess) ? sess[0]?.date : sess?.date
    if (date == null || row.estimated_1rm == null) continue
    rows.push({
      date: String(date),
      estimated_1rm: Number(row.estimated_1rm),
      weight_done: row.weight_done,
      reps_done: row.reps_done,
      target_reps: row.target_reps,
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  return rows.map((r, i) => ({
    ...r,
    chartKey: `${r.date}_${i}`,
    shortDate: formatChartDay(r.date),
  }))
}

function ProgressTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-slate-900">{formatTableDate(p.date)}</p>
      <ul className="mt-1 space-y-0.5 text-slate-600">
        <li>
          1RM: <span className="font-semibold tabular-nums text-slate-900">{formatKg(p.estimated_1rm)}</span>
        </li>
        <li>
          Gewicht:{' '}
          <span className="font-medium tabular-nums text-slate-900">
            {p.weight_done != null ? `${Number(p.weight_done)} kg` : '—'}
          </span>
        </li>
        <li>
          Reps:{' '}
          <span className="font-medium tabular-nums text-slate-900">
            {p.reps_done != null ? String(p.reps_done) : '—'}
          </span>
        </li>
      </ul>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

export default function ClientProgress() {
  const { clientId } = useParams()
  const [client, setClient] = useState(null)
  const [exercises, setExercises] = useState([])
  const [exerciseId, setExerciseId] = useState('')
  const [series, setSeries] = useState([])
  const [loadingPage, setLoadingPage] = useState(true)
  const [loadingSeries, setLoadingSeries] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    queueMicrotask(() => {
      void (async () => {
        setLoadingPage(true)
        setError('')
        try {
          const [cRow, exList] = await Promise.all([fetchClientName(clientId), fetchLoggedExercises(clientId)])
          if (cancelled) return
          if (!cRow) {
            setError('Klant niet gevonden.')
            setClient(null)
            setExercises([])
            return
          }
          setClient(cRow)
          setExercises(exList)
          setExerciseId((prev) => {
            if (prev && exList.some((e) => e.id === prev)) return prev
            return exList[0]?.id ?? ''
          })
        } catch (e) {
          if (!cancelled) setError(e?.message || 'Kon gegevens niet laden.')
        } finally {
          if (!cancelled) setLoadingPage(false)
        }
      })()
    })
    return () => {
      cancelled = true
    }
  }, [clientId])

  const loadSeries = useCallback(async () => {
    if (!clientId || !exerciseId) {
      setSeries([])
      return
    }
    setLoadingSeries(true)
    try {
      const data = await fetchProgressSeries(clientId, exerciseId)
      setSeries(data)
    } catch (e) {
      setError(e?.message || 'Kon progressie niet laden.')
      setSeries([])
    } finally {
      setLoadingSeries(false)
    }
  }, [clientId, exerciseId])

  useEffect(() => {
    queueMicrotask(() => {
      void loadSeries()
    })
  }, [loadSeries])

  const stats = useMemo(() => {
    if (!series.length) {
      return {
        max1rm: null,
        latest1rm: null,
        progressPct: null,
        count: 0,
      }
    }
    const max1rm = Math.max(...series.map((r) => r.estimated_1rm))
    const latest1rm = series[series.length - 1]?.estimated_1rm ?? null
    const first1rm = series[0]?.estimated_1rm ?? null
    return {
      max1rm,
      latest1rm,
      progressPct: formatPct(first1rm, latest1rm),
      count: series.length,
    }
  }, [series])

  const tableRows = useMemo(() => [...series].reverse(), [series])

  const tickMap = useMemo(() => {
    const m = new Map()
    for (const r of series) m.set(r.chartKey, r.shortDate)
    return m
  }, [series])

  if (!clientId) {
    return (
      <main className="mx-auto max-w-2xl flex-1 px-4 py-8">
        <p className="text-slate-600">Ongeldige URL.</p>
      </main>
    )
  }

  if (loadingPage) {
    return (
      <main className="mx-auto max-w-2xl flex-1 px-4 py-16 text-center text-slate-500">
        Laden…
      </main>
    )
  }

  if (error && !client) {
    return (
      <main className="mx-auto max-w-2xl flex-1 px-4 py-8">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-slate-700">
          ← Overzicht
        </Link>
      </main>
    )
  }

  const hasLine = series.length >= 2

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">
      <Link
        to="/"
        className="text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] inline-flex items-center"
      >
        ← Overzicht
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Progressie</h1>
        <p className="mt-1 text-lg text-slate-700">{client?.name ?? 'Klant'}</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-8">
        <label htmlFor="cp-exercise" className="block text-sm font-medium text-slate-700">
          Oefening
        </label>
        <select
          id="cp-exercise"
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          disabled={!exercises.length}
          className="mt-2 w-full min-h-[48px] rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
        >
          {!exercises.length ? (
            <option value="">Nog geen gelogde oefeningen</option>
          ) : (
            exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))
          )}
        </select>
      </div>

      {!exerciseId ? (
        <p className="mt-10 text-center text-slate-500">Kies een klant met trainingshistoriek.</p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <StatCard label="Hoogste 1RM" value={stats.max1rm != null ? formatKg(stats.max1rm) : '—'} />
            <StatCard label="Meest recente 1RM" value={stats.latest1rm != null ? formatKg(stats.latest1rm) : '—'} />
            <StatCard label="Progressie (eerste → laatste)" value={stats.progressPct} />
            <StatCard label="Totaal gelogd" value={String(stats.count)} />
          </div>

          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">1RM over tijd</h2>
            {loadingSeries ? (
              <div className="flex h-[280px] items-center justify-center text-slate-500">Laden…</div>
            ) : !hasLine ? (
              <div className="flex h-[280px] items-center justify-center text-center text-slate-500">
                Nog niet genoeg data
              </div>
            ) : (
              <div className="mt-4 h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="chartKey"
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      tickFormatter={(k) => tickMap.get(k) ?? ''}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      width={44}
                      tickFormatter={(v) => `${v}`}
                      label={{
                        value: 'kg (1RM)',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fill: '#94a3b8', fontSize: 11 },
                      }}
                    />
                    <Tooltip content={<ProgressTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="estimated_1rm"
                      name="1RM"
                      stroke={CHART_BLUE}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CHART_BLUE }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Alle logs</h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-4 py-3 font-medium">Datum</th>
                    <th className="px-4 py-3 font-medium">Gewicht</th>
                    <th className="px-4 py-3 font-medium">Reps</th>
                    <th className="px-4 py-3 font-medium">1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        Geen logs met berekende 1RM.
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((row) => (
                      <tr key={row.chartKey} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 text-slate-900">{formatTableDate(row.date)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {row.weight_done != null ? `${Number(row.weight_done)} kg` : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {row.reps_done != null ? String(row.reps_done) : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums font-medium text-slate-900">
                          {formatKg(row.estimated_1rm)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
