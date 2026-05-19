import { useCallback, useEffect, useState } from 'react'
import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'

function normalizeProgressRows(raw) {
  const rows = []
  for (const row of raw || []) {
    const sess = row.sessions
    const date = Array.isArray(sess) ? sess[0]?.date : sess?.date
    if (date == null || row.estimated_1rm == null) continue
    rows.push({
      date: String(date),
      estimated_1rm: Number(row.estimated_1rm),
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  return rows.map((r, i) => ({
    ...r,
    chartKey: `${r.date}_${i}`,
  }))
}

export default function MiniProgress({ clientId, exerciseId }) {
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!clientId || !exerciseId) {
      setSeries([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('session_exercises')
        .select(
          `
          estimated_1rm,
          sessions!inner ( date, client_id )
        `,
        )
        .eq('sessions.client_id', clientId)
        .eq('exercise_id', exerciseId)
        .not('estimated_1rm', 'is', null)

      if (error) throw error
      setSeries(normalizeProgressRows(data))
    } catch {
      setSeries([])
    } finally {
      setLoading(false)
    }
  }, [clientId, exerciseId])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  if (loading || series.length < 2) {
    return <div className="h-[120px] w-[140px] shrink-0 rounded-lg bg-slate-100/80" aria-hidden />
  }

  return (
    <div className="h-[120px] w-[140px] shrink-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Line
            type="monotone"
            dataKey="estimated_1rm"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
