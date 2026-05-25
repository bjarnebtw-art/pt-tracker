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

/**
 * @param {number} kg
 * @returns {number}
 */
export function roundWeight25(kg) {
  return Math.round(kg / 2.5) * 2.5
}

/**
 * Default warmup → topset weight for progressive sets.
 * @param {number} advisedWeight
 * @param {number} setNumber 1-based
 * @param {number} totalSets
 * @returns {number}
 */
export function defaultSetWeight(advisedWeight, setNumber, totalSets) {
  if (totalSets <= 1) return roundWeight25(advisedWeight)
  const t = (setNumber - 1) / (totalSets - 1)
  const factor = 0.75 + 0.25 * t
  return roundWeight25(advisedWeight * factor)
}
