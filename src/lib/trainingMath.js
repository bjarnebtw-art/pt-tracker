/**
 * @param {number} prevOneRm
 * @param {number} targetReps
 * @returns {number}
 */
export function computeAdvisedWeight(prevOneRm, targetReps) {
  const raw = prevOneRm / (1 + targetReps / 30)
  return Math.round(raw / 2.5) * 2.5
}

/**
 * @param {number} weight
 * @param {number} reps
 * @returns {number}
 */
export function computeEstimatedOneRm(weight, reps) {
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}
