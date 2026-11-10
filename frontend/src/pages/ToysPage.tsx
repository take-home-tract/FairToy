import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, type Exposure, type ToySummary } from '../api'
import { ExposureBadge } from '../components/ExposureBadge'
import { EmptyState, ErrorState, Skeleton } from '../components/States'
import { EXPOSURE_LABEL, EXPOSURE_SHORT_LABEL, EXPOSURES, isExposure } from '../exposure'

function countOf(summary: ToySummary, exposure: Exposure): number {
  return { affected: summary.affected, possibly_affected: summary.possiblyAffected, no_finding: summary.noFinding }[exposure]
}

export function ToysPage() {
  const toys = useQuery({ queryKey: ['toys'], queryFn: api.toys })
  // The chosen filter is kept in the URL, so a refresh or a shared link lands in the same place.
  const [params, setParams] = useSearchParams()
  const filterParam = params.get('exposure')
  const filter = isExposure(filterParam) ? filterParam : null
  const [search, setSearch] = useState('')

  function chooseFilter(exposure: Exposure | null) {
    setParams(exposure ? { exposure } : {}, { replace: true })
  }

  if (toys.isPending) return <Skeleton rows={10} />
  if (toys.isError) return <ErrorState what="your toys" error={toys.error} onRetry={() => toys.refetch()} />

  const { summary, toys: all } = toys.data
  const needle = search.trim().toLowerCase()
  const shown = all.filter(
    (toy) =>
      (filter === null || toy.exposure === filter) &&
      (needle === '' || toy.name.toLowerCase().includes(needle) || toy.code.toLowerCase().includes(needle)),
  )
  const noFindingsRecorded = summary.affected + summary.possiblyAffected === 0

  return (
    <>
      <h1>Your toys</h1>

      {/* The answer first: the three counts are always on screen. */}
      <dl className="summary">
        <div>
          <dt>Toys</dt>
          <dd>{summary.total}</dd>
        </div>
        {EXPOSURES.map((exposure) => (
          <div key={exposure} className={`summary-${exposure}`}>
            <dt>{EXPOSURE_LABEL[exposure]}</dt>
            <dd>{countOf(summary, exposure)}</dd>
          </div>
        ))}
      </dl>

      {noFindingsRecorded && (
        <p className="banner">No findings recorded yet. Flag a supplier to see which toys it reaches.</p>
      )}

      <div className="toolbar">
        <div className="filters" role="group" aria-label="Filter by exposure">
          <button type="button" aria-pressed={filter === null} onClick={() => chooseFilter(null)}>
            All {summary.total}
          </button>
          {EXPOSURES.map((exposure) => (
            <button
              key={exposure}
              type="button"
              aria-pressed={filter === exposure}
              onClick={() => chooseFilter(exposure)}
            >
              {EXPOSURE_SHORT_LABEL[exposure]} {countOf(summary, exposure)}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search toys…"
          aria-label="Search toys by name or code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No toys match.">
          <p>
            {needle && <>Nothing matches “{search.trim()}”</>}
            {needle && filter && ' '}
            {filter && <>{needle ? 'in' : 'No toys are in'} “{EXPOSURE_LABEL[filter]}”</>}.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('')
              chooseFilter(null)
            }}
          >
            Show all toys
          </button>
        </EmptyState>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Toy</th>
              <th>Code</th>
              <th>Exposure</th>
              <th>Flagged suppliers in its chain</th>
              <th className="number">Parts touched</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((toy) => (
              <tr key={toy.id}>
                <td>
                  <Link to={`/toys/${toy.id}`}>{toy.name}</Link>
                </td>
                <td className="code">{toy.code}</td>
                <td>
                  <ExposureBadge exposure={toy.exposure} />
                </td>
                <td>
                  {toy.flaggedSuppliers.length === 0 ? (
                    <span className="muted">None</span>
                  ) : (
                    toy.flaggedSuppliers.map((supplier, index) => (
                      <span key={supplier.id}>
                        {index > 0 && ', '}
                        <Link to={`/suppliers/${supplier.id}`}>{supplier.name}</Link>
                      </span>
                    ))
                  )}
                </td>
                <td className="number">
                  {toy.partsTouched} of {toy.partCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
