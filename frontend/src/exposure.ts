import type { Exposure } from './api'

// Every status has a word and a symbol as well as a color (docs/ux.md).
// "No finding" is never worded as safe.
export const EXPOSURES: Exposure[] = ['affected', 'possibly_affected', 'no_finding']

export const EXPOSURE_LABEL: Record<Exposure, string> = {
  affected: 'Affected',
  possibly_affected: 'Possibly affected',
  no_finding: 'No finding in its chain',
}

export const EXPOSURE_SHORT_LABEL: Record<Exposure, string> = {
  affected: 'Affected',
  possibly_affected: 'Possibly affected',
  no_finding: 'No finding',
}

export const EXPOSURE_SYMBOL: Record<Exposure, string> = {
  affected: '✕',
  possibly_affected: '?',
  no_finding: '–',
}

export const EXPOSURE_HELP: Record<Exposure, string> = {
  affected: 'At least one part can only come from a supplier you flagged.',
  possibly_affected: 'We cannot tell which supplier made it. Check your purchase records.',
  no_finding: 'You have recorded no finding that touches this toy. This does not mean it is safe.',
}

export function isExposure(value: string | null): value is Exposure {
  return value !== null && (EXPOSURES as string[]).includes(value)
}
