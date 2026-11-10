import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, isNotFound, type TracePart, type TraceSource } from '../api'
import { ExposureBadge } from '../components/ExposureBadge'
import { FindingButton } from '../components/FindingControls'
import { EmptyState, ErrorState, Skeleton } from '../components/States'
import { EXPOSURE_HELP } from '../exposure'
import { plantName, plural, whySentence } from '../format'

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
            ? 'Every part has a single possible supplier.'
            : `${plural(singleSource, 'part has', 'parts have')} a single possible supplier, ${
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

      {bySupplier ? <BySupplier suppliers={suppliers} /> : <ByPart parts={parts} />}
    </>
  )
}

// --- by part ---

function ByPart({ parts }: { parts: TracePart[] }) {
  const touched = parts.filter((part) => part.exposure !== 'no_finding')
  const others = parts.filter((part) => part.exposure === 'no_finding')
  return (
    <>
      {touched.length > 0 && (
        <section aria-labelledby="touched-heading">
          <h2 id="touched-heading">Parts touched by a finding ({touched.length})</h2>
          <ul className="parts">
            {touched.map((part) => (
              <li key={part.id} className="part">
                <div className="part-head">
                  <span>
                    <strong>{part.name}</strong> <span className="code">{part.code}</span>
                  </span>
                  <ExposureBadge exposure={part.exposure} />
                </div>
                <SourceList sources={part.sources} />
                {part.exposure === 'possibly_affected' && <p className="part-help">{EXPOSURE_HELP.possibly_affected}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Parts with no finding are collapsed when there is something more urgent above them. */}
      {others.length > 0 && (
        <details className="other-parts" open={touched.length === 0}>
          <summary>
            {touched.length > 0 ? 'Other parts' : 'Parts'} ({others.length})
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

function SourceList({ sources }: { sources: TraceSource[] }) {
  return (
    <ul className="sources">
      {sources.map((source, index) => (
        <li key={index}>
          <Link to={`/suppliers/${source.supplier.id}`}>{source.supplier.name}</Link> ({source.supplier.country}) —{' '}
          {plantName(source)}, {source.factory.country}
          {source.hasFinding && <span className="tag-finding">Finding</span>}
        </li>
      ))}
    </ul>
  )
}

// --- by supplier ---

interface SupplierInChain {
  id: number
  name: string
  country: string
  hasFinding: boolean
  /** The parts of this toy the supplier can make, and who else can make each. */
  parts: { part: TracePart; alternatives: string[] }[]
  onlySourceOfSomething: boolean
}

function supplierCount(part: TracePart): number {
  return new Set(part.sources.map((source) => source.supplier.id)).size
}

/** The same chain turned around: each supplier behind the toy, with the parts it can make. */
function groupBySupplier(parts: TracePart[]): SupplierInChain[] {
  const byId = new Map<number, SupplierInChain>()
  for (const part of parts) {
    const names = new Map(part.sources.map((source) => [source.supplier.id, source.supplier.name]))
    for (const source of part.sources) {
      let supplier = byId.get(source.supplier.id)
      if (!supplier) {
        supplier = { ...source.supplier, hasFinding: source.hasFinding, parts: [], onlySourceOfSomething: false }
        byId.set(source.supplier.id, supplier)
      }
      if (supplier.parts.some((entry) => entry.part.id === part.id)) continue // a second factory of the same supplier
      const alternatives = [...names].filter(([id]) => id !== source.supplier.id).map(([, name]) => name)
      supplier.parts.push({ part, alternatives })
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
                    {supplier.parts.map(({ part, alternatives }) => (
                      <div key={part.id}>
                        {part.name} <span className="code">{part.code}</span>{' '}
                        {alternatives.length === 0 ? (
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
