import type { ReachedToy, TracePart, TraceSource } from './api'

/** "2026-11-10T14:02:11Z" -> "10 Nov 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Factory names repeat the supplier ("Lianfa Group — Cavite Plant"). Next to the supplier, show only the plant. */
export function plantName(source: TraceSource): string {
  return withoutSupplierPrefix(source.factory.name, source.supplier.name)
}

/** "Lianfa Group — Cavite Plant" next to the supplier "Lianfa Group" -> "Cavite Plant" */
export function withoutSupplierPrefix(factoryName: string, supplierName: string): string {
  const prefix = supplierName + ' — '
  return factoryName.startsWith(prefix) ? factoryName.slice(prefix.length) : factoryName
}

export function plural(count: number, one: string, many = one + 's'): string {
  return `${count} ${count === 1 ? one : many}`
}

/** What flagging a supplier would do to the toys it reaches. Only toys that change are counted. */
export function impactOf(toys: ReachedToy[]) {
  const changing = toys.filter((toy) => toy.exposureNow !== toy.exposureIfFlagged)
  return {
    reached: toys.length,
    becomeAffected: changing.filter((toy) => toy.exposureIfFlagged === 'affected').length,
    becomePossibly: changing.filter((toy) => toy.exposureIfFlagged === 'possibly_affected').length,
    unchanged: toys.length - changing.length,
  }
}

export function listOf(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1]
}

/** The distinct suppliers of a part, flagged ones first (two factories of one supplier count once). */
export function suppliersOf(part: TracePart): { name: string; hasFinding: boolean }[] {
  const seen = new Map<number, { name: string; hasFinding: boolean }>()
  for (const source of part.sources) {
    seen.set(source.supplier.id, { name: source.supplier.name, hasFinding: source.hasFinding })
  }
  return [...seen.values()].sort((a, b) => Number(b.hasFinding) - Number(a.hasFinding))
}

/**
 * One sentence that says why a toy has its exposure, built from the trace.
 * The API sends no prose (docs/api.md).
 */
export function whySentence(parts: TracePart[]): string {
  const affected = parts.find((part) => part.exposure === 'affected')
  if (affected) {
    const suppliers = suppliersOf(affected).map((s) => s.name)
    return suppliers.length === 1
      ? `The part “${affected.name}” can only come from ${suppliers[0]}, which you flagged.`
      : `The part “${affected.name}” can only come from ${listOf(suppliers)}, and you flagged all of them.`
  }
  const possibly = parts.find((part) => part.exposure === 'possibly_affected')
  if (possibly) {
    const suppliers = suppliersOf(possibly).map((s) => (s.hasFinding ? `${s.name} (flagged)` : s.name))
    return `“${possibly.name}” can come from ${listOf(suppliers)}. We cannot tell which was used. Check your purchase records.`
  }
  return 'You have recorded no finding that touches this toy. This does not mean it is safe.'
}
