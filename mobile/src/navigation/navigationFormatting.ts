import type { Units } from '../store/navigationSettingsStore'

/** Round to 5 m for metric display stability */
export function roundMetricMeters(m: number): number {
  return Math.round(m / 5) * 5
}

export function formatNavDistanceLine(meters: number, units: Units): string {
  const raw = Math.max(0, meters)
  const m = units === 'metric' ? roundMetricMeters(raw) : raw
  if (units === 'imperial') {
    const mi = m / 1609.344
    if (mi >= 0.1) return `${mi >= 10 ? mi.toFixed(0) : mi.toFixed(1)} mi`
    const ft = m * 3.28084
    return `${Math.round(ft / 5) * 5} ft`
  }
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${roundMetricMeters(m)} m`
}
