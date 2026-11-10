import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api, isNotFound, type SupplierDetail, type SupplierPart } from '../api'
import { ExposureBadge } from '../components/ExposureBadge'
import { FindingButton, FindingState } from '../components/FindingControls'
import { EmptyState, ErrorState, Skeleton } from '../components/States'
import { impactOf, plural, withoutSupplierPrefix } from '../format'

/**
 * One supplier, for someone deciding whether to flag it or checking what a
 * finding did: what it makes for you, which toys that reaches and through
 * which parts, and what a finding changes.
 */
export function SupplierDetailPage() {
  const { supplierId = '' } = useParams()
  const detail = useQuery({ queryKey: ['supplier', supplierId], queryFn: () => api.supplier(supplierId) })

  if (detail.isPending) return <Skeleton rows={8} />
  if (detail.isError) {
    if (isNotFound(detail.error)) {
      return (
        <EmptyState title="Supplier not found.">
          <p>
            <Link to="/suppliers">Back to your suppliers</Link>
          </p>
        </EmptyState>
      )
    }
    return <ErrorState what="this supplier" error={detail.error} onRetry={() => detail.refetch()} />
  }

  const { supplier, parts, toys } = detail.data
  const flagged = supplier.finding !== null
  const partById = new Map(parts.map((part) => [part.id, part]))

  return (
    <>
      <p className="back">
        <Link to="/suppliers">‹ Suppliers</Link>
      </p>
      <div className="title-row">
        <h1>
          {supplier.name} <span className="code">{supplier.code}</span>
        </h1>
        <FindingButton supplier={supplier} flagged={flagged} />
      </div>
      <p className="why">
        Headquarters: {supplier.country} · Finding: <FindingState finding={supplier.finding} />
      </p>

      <Impact detail={detail.data} />

      <section aria-labelledby="parts-heading">
        <h2 id="parts-heading">Parts it can make for you ({parts.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>Made at</th>
              <th>Other possible suppliers</th>
              <th className="number">Used in</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <tr key={part.id}>
                <td>
                  {part.name} <span className="code">{part.code}</span>
                </td>
                <td>
                  {part.factories.map((factory, index) => (
                    <div key={index}>
                      {withoutSupplierPrefix(factory.name, supplier.name)}, {factory.country}
                    </div>
                  ))}
                </td>
                <td>
                  <OtherSuppliers part={part} />
                </td>
                <td className="number">{plural(part.toyCount, 'toy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="toys-heading">
        <h2 id="toys-heading">Toys it reaches ({toys.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Toy</th>
              <th>Through these parts</th>
              <th>Exposure now</th>
              {!flagged && <th>If flagged</th>}
            </tr>
          </thead>
          <tbody>
            {toys.map((toy) => (
              <tr key={toy.id}>
                <td>
                  <Link to={`/toys/${toy.id}`}>{toy.name}</Link> <span className="code">{toy.code}</span>
                </td>
                <td>
                  {toy.partIds.map((partId) => {
                    const part = partById.get(partId)
                    if (!part) return null
                    return (
                      <div key={partId}>
                        {part.name}{' '}
                        {part.otherSuppliers.length === 0 ? (
                          <span className="only-source">only source</span>
                        ) : (
                          <span className="muted">or {part.otherSuppliers.map((s) => s.name).join(', ')}</span>
                        )}
                      </div>
                    )
                  })}
                </td>
                <td>
                  <ExposureBadge exposure={toy.exposureNow} />
                </td>
                {!flagged && (
                  <td>
                    <ExposureBadge exposure={toy.exposureIfFlagged} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

function OtherSuppliers({ part }: { part: SupplierPart }) {
  if (part.otherSuppliers.length === 0) return <span className="only-source">None: only source</span>
  return (
    <>
      {part.otherSuppliers.map((other, index) => (
        <span key={other.id}>
          {index > 0 && ', '}
          <Link to={`/suppliers/${other.id}`}>{other.name}</Link>
        </span>
      ))}
    </>
  )
}

/** The answer first: what a finding against this supplier does, or would do. */
function Impact({ detail }: { detail: SupplierDetail }) {
  const { supplier, toys } = detail
  if (supplier.finding) {
    const affected = toys.filter((toy) => toy.exposureNow === 'affected').length
    const possibly = toys.filter((toy) => toy.exposureNow === 'possibly_affected').length
    return (
      <div className="impact impact-flagged" role="region" aria-label="Impact">
        <p>
          <strong>You flagged this supplier.</strong> Of the {plural(toys.length, 'toy')} it reaches:
        </p>
        <ul>
          <li>
            <strong>{affected}</strong> {affected === 1 ? 'is' : 'are'} Affected
          </li>
          <li>
            <strong>{possibly}</strong> {possibly === 1 ? 'is' : 'are'} Possibly affected: check your purchase records
          </li>
        </ul>
      </div>
    )
  }
  const { becomeAffected, becomePossibly, unchanged } = impactOf(toys)
  return (
    <div className="impact" role="region" aria-label="Impact">
      <p>
        <strong>If you flag this supplier</strong>, of the {plural(toys.length, 'toy')} it reaches:
      </p>
      <ul>
        <li>
          <strong>{becomeAffected}</strong> would become Affected: it is the only source of a part they use
        </li>
        <li>
          <strong>{becomePossibly}</strong> would become Possibly affected: another supplier can make the part too
        </li>
        {unchanged > 0 && (
          <li>
            <strong>{unchanged}</strong> would not change (already exposed through another finding)
          </li>
        )}
      </ul>
    </div>
  )
}
