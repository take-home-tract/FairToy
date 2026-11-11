import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useAuth } from './auth'
import { useNotice } from './notice'

interface SupplierRef {
  id: number
  name: string
}

/** Every list and detail on screen depends on findings and resolutions. */
function useRefetchAll() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      ['toys', 'toy', 'suppliers', 'supplier'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    )
}

/**
 * Record and withdraw a finding.
 *
 * The server is the source of truth: after either change, everything on screen
 * that depends on findings is refetched, and success is only reported once the
 * server has confirmed. A failed change leaves the screen as it was.
 */
export function useFindingActions() {
  const refetchAll = useRefetchAll()
  const { show } = useNotice()
  const { currentSession } = useAuth()
  // The sign-in a change starts in. Its notice is dropped if the user changed meanwhile.
  const onMutate = () => ({ session: currentSession() })

  const withdraw = useMutation({
    mutationFn: (supplier: SupplierRef) => api.withdrawFinding(supplier.id),
    onMutate,
    onSuccess: async (_result, supplier, context) => {
      await refetchAll()
      show({ text: `Finding against ${supplier.name} withdrawn.` }, context?.session)
    },
    onError: (error, supplier, context) => {
      show({ text: `Could not withdraw the finding against ${supplier.name}. ${error.message}` }, context?.session)
    },
  })

  const record = useMutation({
    mutationFn: (supplier: SupplierRef) => api.recordFinding(supplier.id),
    onMutate,
    onSuccess: async (_result, supplier, context) => {
      await refetchAll()
      show(
        { text: `${supplier.name} flagged.`, action: { label: 'Undo', run: () => withdraw.mutate(supplier) } },
        context?.session,
      )
    },
  })

  return { record, withdraw }
}

interface ResolutionTarget {
  toyId: number
  part: { id: number; name: string }
}

/**
 * Record and withdraw which supplier made a part of a toy (a resolution).
 * Same rules as findings: refetch after the change, report only what the server confirmed.
 */
export function useResolutionActions() {
  const refetchAll = useRefetchAll()
  const { show } = useNotice()
  const { currentSession } = useAuth()
  const onMutate = () => ({ session: currentSession() })

  const withdraw = useMutation({
    mutationFn: (target: ResolutionTarget) => api.withdrawResolution(target.toyId, target.part.id),
    onMutate,
    onSuccess: async (_result, target, context) => {
      await refetchAll()
      show({ text: `Supplier of “${target.part.name}” no longer recorded.` }, context?.session)
    },
    onError: (error, _target, context) => show({ text: `Could not withdraw it. ${error.message}` }, context?.session),
  })

  const record = useMutation({
    mutationFn: (target: ResolutionTarget & { supplier: SupplierRef }) =>
      api.recordResolution(target.toyId, target.part.id, target.supplier.id),
    onMutate,
    onSuccess: async (_result, target, context) => {
      await refetchAll()
      show(
        {
          text: `Recorded: “${target.part.name}” came from ${target.supplier.name}.`,
          action: { label: 'Undo', run: () => withdraw.mutate(target) },
        },
        context?.session,
      )
    },
    onError: (error, _target, context) => show({ text: `Could not record it. ${error.message}` }, context?.session),
  })

  return { record, withdraw }
}
