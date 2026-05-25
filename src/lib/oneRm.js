import { supabase } from './supabase'

/**
 * @param {string} clientId
 * @returns {Promise<Map<string, number>>} exercise_id -> latest estimated_1rm
 */
export async function fetchLatestOneRmByExercise(clientId) {
  const { data, error } = await supabase
    .from('session_exercises')
    .select(
      `
      exercise_id,
      session_id,
      estimated_1rm,
      set_number,
      sessions!inner ( date, client_id )
    `,
    )
    .eq('sessions.client_id', clientId)
    .not('estimated_1rm', 'is', null)

  if (error) throw error

  /** @type {Map<string, { exId: string, e1: number, date: string, setNum: number }>} */
  const topsetPerSession = new Map()
  for (const row of data || []) {
    const exId = row.exercise_id
    const sessionId = row.session_id
    const e1 = row.estimated_1rm
    const sess = row.sessions
    const date = Array.isArray(sess) ? sess[0]?.date : sess?.date
    if (exId == null || sessionId == null || e1 == null || date == null) continue
    const setNum = Number(row.set_number) || 1
    const key = `${sessionId}-${exId}`
    const prev = topsetPerSession.get(key)
    if (!prev || setNum > prev.setNum) {
      topsetPerSession.set(key, { exId, e1: Number(e1), date: String(date), setNum })
    }
  }

  /** @type {Map<string, { e1: number, date: string }>} */
  const best = new Map()
  for (const { exId, e1, date } of topsetPerSession.values()) {
    const prev = best.get(exId)
    if (!prev || String(date) > String(prev.date)) {
      best.set(exId, { e1, date })
    }
  }
  const out = new Map()
  for (const [id, v] of best) out.set(id, v.e1)
  return out
}
