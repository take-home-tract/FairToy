import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, isNotFound, type Resolution, type TracePart, type TraceSource } from '../api'
import { ExposureBadge } from '../components/ExposureBadge'
import { FindingButton } from '../components/FindingControls'
import { useResolutionActions } from '../findings'
import { EmptyState, ErrorState, Skeleton } from '../components/States'
import { EXPOSURE_HELP } from '../exposure'
import { effectiveSources, formatDate, plantName, plural, suppliersOf, whySentence } from '../format'

/**
 * One toy, traced back through its parts to the suppliers that can make them.
 * Two ways to read the same chain: part by part, or supplier by supplier.
 */
export function ToyTracePage() {
  const { toyId = '' } = useParams()
  const trace = useQuery({ queryKey: ['toy', toyId], queryFn: () => api.toy(toyId) })
  // The chosen view is kept in the URL, like the filter on the Toys page.
  const [params, setParams] = useSearchParams()
  const bySupplier = params.get('view') === 'supplier'

  if (trace.isPending) return <Skeleton rows={8} />
  if (trace.isError) {
    if (isNotFound(trace.error)) {
      return (
        <EmptyState title="Toy not found.">
          <p>
            <Link to="/toys">Back to your toys</Link>
          </p>
        </EmptyState>
      )
    }
    return <ErrorState what="this toy" error={trace.error} onRetry={() => trace.refetch()} />
  }

  const { toy, parts } = trace.data
  const suppliers = groupBySupplier(parts)
  const singleSource = parts.filter((part) => supplierCount(part) === 1).length

  return (
    <>
      <p className="back">
        <Link to="/toys">‹ Toys</Link>
      </p>
      <div className="title-row">
        <h1>
          {toy.name} <span className="code">{toy.code}</span>
        </h1>
        <ExposureBadge exposure={toy.exposure} />
      </div>
      <p className="why">
        <strong>Why:</strong> {whySentence(parts)}
      </p>

      <div className="toolbar chain-toolbar">
        <p className="chain-summary">
          {plural(parts.length, 'part')} from {plural(suppliers.length, 'supplier')}.{' '}
          {singleSource === parts.length
            ? 'Every part has a single known supplier.'
            : `${plural(singleSource, 'part has', 'parts have')} a single known supplier, ${
                parts.length - singleSource
              } can come from more than one.`}
        </p>
        <div className="filters" role="group" aria-label="View the chain">
          <button type="button" aria-pressed={!bySupplier} onClick={() => setParams({}, { replace: true })}>
            By part
          </button>
          <button
            type="button"
            aria-pressed={bySupplier}
            onClick={() => setParams({ view: 'supplier' }, { replace: true })}
          >
            By supplier
          </button>
        </div>
      </div>

      {bySupplier ? <BySupplier suppliers={suppliers} /> : <ByPart toyId={toy.id} parts={parts} />}
    </>
  )
}

// --- by part ---

function ByPart({ toyId, parts }: { toyId: number; parts: TracePart[] }) {
  const touched = parts.filter((part) => part.exposure !== 'no_finding')
  // Resolved parts with no finding stay visible, so a resolution can be checked or withdrawn.
  const resolved = parts.filter((part) => part.exposure === 'no_finding' && part.resolution)
  const others = parts.filter((part) => part.exposure === 'no_finding' && !part.resolution)
  return (
    <>
      {touched.length > 0 && (
        <section aria-labelledby="touched-heading">
          <h2 id="touched-heading">Parts touched by a finding ({touched.length})</h2>
          <ul className="parts">
            {touched.map((part) => (
              <PartCard key={part.id} toyId={toyId} part={part} />
            ))}
          </ul>
        </section>
      )}

      {resolved.length > 0 && (
        <section aria-labelledby="resolved-heading">
          <h2 id="resolved-heading">Parts you resolved ({resolved.length})</h2>
          <p className="muted group-help">
            You recorded which supplier made these parts. A finding against the other possible suppliers no longer
            touches this toy.
          </p>
          <ul className="parts">
            {resolved.map((part) => (
              <PartCard key={part.id} toyId={toyId} part={part} />
            ))}
          </ul>
        </section>
      )}

      {/* Parts with no finding are collapsed when there is something more urgent above them. */}
      {others.length > 0 && (
        <details className="other-parts" open={touched.length + resolved.length === 0}>
          <summary>
            {touched.length + resolved.length > 0 ? 'Other parts' : 'Parts'} ({others.length})
          </summary>
          <table className="parts-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Possible suppliers and where they make it</th>
              </tr>
            </thead>
            <tbody>
              {others.map((part) => (
                <tr key={part.id}>
                  <td>
                    {part.name} <span className="code">{part.code}</span>
                  </td>
                  <td>
                    <SourceList sources={part.sources} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  )
}

/** One part touched by a finding or resolved: its sources, and what can be done about it. */
function PartCard({ toyId, part }: { toyId: number; part: TracePart }) {
  return (
    <li className="part">
      <div className="part-head">
        <span>
          <strong>{part.name}</strong> <span className="code">{part.code}</span>
        </span>
        <ExposureBadge exposure={part.exposure} />
      </div>
      <SourceList sources={part.sources} resolution={part.resolution} />
      {part.resolution ? (
        <RecordedSupplier toyId={toyId} part={part} resolution={part.resolution} />
      ) : (
        part.exposure === 'possibly_affected' && <ChooseSupplier toyId={toyId} part={part} />
      )}
    </li>
  )
}

/** For a possibly affected part: say which supplier actually made it, for example from purchase records. */
function ChooseSupplier({ toyId, part }: { toyId: number; part: TracePart }) {
  const { record } = useResolutionActions()
  return (
    <div className="resolve">
      <p className="part-help">{EXPOSURE_HELP.possibly_affected}</p>
      <div className="resolve-choices" role="group" aria-label={`Which supplier made the ${part.name}?`}>
        <span>Which supplier made it?</span>
        {suppliersOf(part).map((supplier) => (
          <button
            key={supplier.id}
            type="button"
            disabled={record.isPending}
            onClick={() => record.mutate({ toyId, part, supplier })}
          >
            {supplier.name}
            {supplier.hasFinding && ' (flagged)'}
          </button>
        ))}
      </div>
    </div>
  )
}

function RecordedSupplier({ toyId, part, resolution }: { toyId: number; part: TracePart; resolution: Resolution }) {
  const { withdraw } = useResolutionActions()
  return (
    <p className="resolution">
      <span>
        <strong>Made by {resolution.supplier.name}</strong>
        <span className="muted">
          {' '}
          · recorded {formatDate(resolution.recordedAt)} by {resolution.recordedBy}
        </span>
      </span>
      <button
        type="button"
        className="link-button"
        disabled={withdraw.isPending}
        onClick={() => withdraw.mutate({ toyId, part })}
      >
        Withdraw
      </button>
    </p>
  )
}

function SourceList({ sources, resolution }: { sources: TraceSource[]; resolution?: Resolution | null }) {
  return (
    <ul className="sources">
      {sources.map((source, index) => {
        const notUsed = resolution != null && source.supplier.id !== resolution.supplier.id
        return (
          <li key={index} className={notUsed ? 'source-not-used' : undefined}>
            <Link to={`/suppliers/${source.supplier.id}`}>{source.supplier.name}</Link> ({source.supplier.country}) —{' '}
            {plantName(source)}, {source.factory.country}
            {source.hasFinding && <span className="tag-finding">Finding</span>}
            {resolution && (notUsed ? <span className="muted"> not used</span> : <span className="tag-used">Used</span>)}
          </li>
        )
      })}
    </ul>
  )
}

// --- by supplier ---

interface SupplierInChain {
  id: number
  name: string
  country: string
  hasFinding: boolean
  /** The parts of this toy the supplier can make (or made), and who else could. */
  parts: { part: TracePart; alternatives: string[]; recorded: boolean }[]
  onlySourceOfSomething: boolean
}

function supplierCount(part: TracePart): number {
  return new Set(effectiveSources(part).map((source) => source.supplier.id)).size
}

/** The same chain turned around: each supplier behind the toy, with the parts it can make. */
function groupBySupplier(parts: TracePart[]): SupplierInChain[] {
  const byId = new Map<number, SupplierInChain>()
  for (const part of parts) {
    // Once a part is resolved, only the supplier that made it is behind this toy.
    const sources = effectiveSources(part)
    const names = new Map(sources.map((source) => [source.supplier.id, source.supplier.name]))
    for (const source of sources) {
      let supplier = byId.get(source.supplier.id)
      if (!supplier) {
        supplier = { ...source.supplier, hasFinding: source.hasFinding, parts: [], onlySourceOfSomething: false }
        byId.set(source.supplier.id, supplier)
      }
      if (supplier.parts.some((entry) => entry.part.id === part.id)) continue // a second factory of the same supplier
      const alternatives = [...names].filter(([id]) => id !== source.supplier.id).map(([, name]) => name)
      supplier.parts.push({ part, alternatives, recorded: part.resolution !== null })
      if (alternatives.length === 0) supplier.onlySourceOfSomething = true
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function BySupplier({ suppliers }: { suppliers: SupplierInChain[] }) {
  // Most urgent first: flagged, then suppliers the toy cannot do without, then the rest.
  const groups = [
    { title: 'Flagged', suppliers: suppliers.filter((s) => s.hasFinding) },
    {
      title: 'Only source of a part',
      help: 'A finding against one of these would make this toy Affected.',
      suppliers: suppliers.filter((s) => !s.hasFinding && s.onlySourceOfSomething),
    },
    {
      title: 'One of several sources',
      help: 'A finding against one of these would make this toy Possibly affected.',
      suppliers: suppliers.filter((s) => !s.hasFinding && !s.onlySourceOfSomething),
    },
  ].filter((group) => group.suppliers.length > 0)

  return (
    <>
      {groups.map((group) => (
        <section key={group.title} aria-label={`${group.title} (${group.suppliers.length})`}>
          <h2>
            {group.title} ({group.suppliers.length})
          </h2>
          {group.help && <p className="muted group-help">{group.help}</p>}
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Parts of this toy it can make</th>
                <th>
                  <span className="visually-hidden">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {group.suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>
                    <Link to={`/suppliers/${supplier.id}`}>{supplier.name}</Link>{' '}
                    <span className="muted">({supplier.country})</span>
                    {supplier.hasFinding && <span className="tag-finding">Finding</span>}
                  </td>
                  <td>
                    {supplier.parts.map(({ part, alternatives, recorded }) => (
                      <div key={part.id}>
                        {part.name} <span className="code">{part.code}</span>{' '}
                        {recorded ? (
                          <span className="tag-used">Used</span>
                        ) : alternatives.length === 0 ? (
                          <span className="only-source">only source</span>
                        ) : (
                          <span className="muted">or {alternatives.join(', ')}</span>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="action">
                    <FindingButton supplier={supplier} flagged={supplier.hasFinding} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}
