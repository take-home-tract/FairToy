import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useNotice } from './notice'

interface SupplierRef {
  id: number
  name: string
}

/**
 * Record and withdraw a finding.
 *
 * The server is the source of truth: after either change, everything on screen
 * that depends on findings is refetched, and success is only reported once the
 * server has confirmed. A failed change leaves the screen as it was.
 */
export function useFindingActions() {
  const queryClient = useQueryClient()
  const { show } = useNotice()

  // Every list and detail on screen depends on the findings.
  const refetchAll = () =>
    Promise.all(
      ['toys', 'toy', 'suppliers', 'supplier'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    )

  const withdraw = useMutation({
    mutationFn: (supplier: SupplierRef) => api.withdrawFinding(supplier.id),
    onSuccess: async (_result, supplier) => {
      await refetchAll()
      show({ text: `Finding against ${supplier.name} withdrawn.` })
    },
    onError: (error, supplier) => {
      show({ text: `Could not withdraw the finding against ${supplier.name}. ${error.message}` })
    },
  })

  const record = useMutation({
    mutationFn: (supplier: SupplierRef) => api.recordFinding(supplier.id),
    onSuccess: async (_result, supplier) => {
      await refetchAll()
      show({ text: `${supplier.name} flagged.`, action: { label: 'Undo', run: () => withdraw.mutate(supplier) } })
    },
  })

  return { record, withdraw }
}
