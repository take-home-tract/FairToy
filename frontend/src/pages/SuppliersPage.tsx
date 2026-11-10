import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { FindingButton, FindingState } from '../components/FindingControls'
import { EmptyState, ErrorState, Skeleton } from '../components/States'

/** The Finisher's own suppliers, whether each has a finding, and the flag / withdraw action. */
export function SuppliersPage() {
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: api.suppliers })
  const [search, setSearch] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  if (suppliers.isPending) return <Skeleton rows={10} />
  if (suppliers.isError) {
    return <ErrorState what="your suppliers" error={suppliers.error} onRetry={() => suppliers.refetch()} />
  }

  const all = suppliers.data.suppliers
  const needle = search.trim().toLowerCase()
  const flaggedCount = all.filter((s) => s.finding).length
  const shown = all.filter(
    (s) =>
      (!flaggedOnly || s.finding) &&
      (needle === '' ||
        s.name.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        s.country.toLowerCase().includes(needle)),
  )

  return (
    <>
      <h1>Your suppliers</h1>
      <div className="toolbar">
        <div className="filters" role="group" aria-label="Filter by finding">
          <button type="button" aria-pressed={!flaggedOnly} onClick={() => setFlaggedOnly(false)}>
            All {all.length}
          </button>
          <button type="button" aria-pressed={flaggedOnly} onClick={() => setFlaggedOnly(true)}>
            With a finding {flaggedCount}
          </button>
        </div>
        <input
          type="search"
          placeholder="Search suppliers…"
          aria-label="Search suppliers by name, code or country"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No suppliers match.">
          <p>{needle ? <>Nothing matches “{search.trim()}”.</> : 'You have not flagged any supplier.'}</p>
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setFlaggedOnly(false)
            }}
          >
            Show all suppliers
          </button>
        </EmptyState>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Country</th>
              <th className="number">Parts it can make</th>
              <th className="number">Toys reached</th>
              <th>Finding</th>
              <th>
                <span className="visually-hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((supplier) => (
              <tr key={supplier.id}>
                <td>
                  <Link to={`/suppliers/${supplier.id}`}>{supplier.name}</Link> <span className="code">{supplier.code}</span>
                </td>
                <td>{supplier.country}</td>
                <td className="number">{supplier.partCount}</td>
                <td className="number">{supplier.toysReached}</td>
                <td>
                  <FindingState finding={supplier.finding} />
                </td>
                <td className="action">
                  <FindingButton supplier={supplier} flagged={supplier.finding !== null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
