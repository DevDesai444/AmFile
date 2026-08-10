/**
 * Small prompt helpers shared by the ribbon command modules.
 *
 * These use the platform dialogs rather than bespoke React modals, matching what the editor
 * already does for Link, Header and Footer. They are synchronous, which keeps every command
 * a plain function and avoids a half-applied chain if the user cancels midway.
 */

/** Numbered chooser. Returns null if the user cancels or types something out of range. */
export function pick<T extends string>(title: string, options: readonly T[], current?: T): T | null {
  const list = options.map((o, i) => `${i + 1}. ${o}${o === current ? '  ←current' : ''}`).join('\n')
  const answer = window.prompt(`${title}\n\n${list}\n\nEnter a number:`, String(options.indexOf(current as T) + 1 || 1))
  if (answer === null) return null
  const idx = Number(answer.trim()) - 1
  return Number.isInteger(idx) && idx >= 0 && idx < options.length ? options[idx] : null
}

/** Free text with a default. Returns null on cancel; empty string is a valid answer. */
export function askText(label: string, initial = ''): string | null {
  const answer = window.prompt(label, initial)
  return answer === null ? null : answer
}

/** A number within bounds. Returns null on cancel or a non-numeric answer. */
export function askNumber(label: string, initial: number, min: number, max: number): number | null {
  const answer = window.prompt(label, String(initial))
  if (answer === null) return null
  const n = Number(answer.trim())
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, n))
}

/**
 * Parses `Label = value` pairs, one per line, into chart points.
 * Also accepts `Label, value` and `Label: value`.
 */
export function parseDataPairs(raw: string): Array<{ label: string; value: number }> {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s*[=:,]\s*(-?[\d.]+)$/)
      if (!m) return null
      const value = Number(m[2])
      return Number.isFinite(value) ? { label: m[1].trim(), value } : null
    })
    .filter((p): p is { label: string; value: number } => p !== null)
}
