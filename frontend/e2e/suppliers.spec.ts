import { expect, test } from '@playwright/test'
import {
  KESTREL,
  MOONPATH,
  flagSupplier,
  openSignedIn,
  signIn,
  summaryCounts,
  supplierRow,
  todayAsShown,
  resetData,
} from './helpers'

// Lianfa Group is SUP-028. It reaches 22 of Kestrel Play's 40 toys.
const LIANFA = 'SUP-028'

test.beforeEach(async ({ request }) => {
  await resetData(request)
})

test('lists the Finisher’s own suppliers with the toys each reaches and no findings', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')

  await expect(page.getByRole('heading', { name: 'Your suppliers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'All 49' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('tbody tr')).toHaveCount(49)
  await expect(supplierRow(page, LIANFA)).toContainText('Lianfa Group')
  await expect(supplierRow(page, LIANFA)).toContainText('Turkey')
  // It can make 8 of Kestrel Play's parts, which reaches 22 toys.
  await expect(supplierRow(page, LIANFA).locator('td.number')).toHaveText(['8', '22'])
  await expect(page.locator('.tag-finding')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Flag supplier' })).toHaveCount(49)
  // SUP-038 makes no part, so it is in nobody's chain.
  await expect(page.locator('tbody')).not.toContainText('SUP-038')
})

test('search narrows the suppliers', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  const search = page.getByRole('searchbox')

  await search.fill('lianfa group')
  await expect(page.locator('tbody tr')).toHaveCount(1)

  await search.fill('no such supplier')
  await expect(page.getByText('Nothing matches “no such supplier”.')).toBeVisible()
  await page.getByRole('button', { name: 'Show all suppliers' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(49)
})

test('the flag dialog shows the consequence first, and Cancel records nothing', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading')).toHaveText('Flag Lianfa Group for child labor?')
  await expect(dialog).toContainText('22 toys reach this supplier:')
  await expect(dialog).toContainText('13 would become Affected')
  await expect(dialog).toContainText('9 would become Possibly affected')
  await expect(dialog).not.toContainText('would not change')
  await expect(dialog).toContainText('Only Kestrel Play sees this finding.')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.tag-finding')).toHaveCount(0)

  await page.getByRole('link', { name: 'Toys' }).click()
  expect(await summaryCounts(page)).toEqual([40, 0, 0, 40])
})

test('flagging a supplier records who and when, and the toys change', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Flag supplier' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Lianfa Group flagged.')
  const row = supplierRow(page, LIANFA)
  await expect(row).toContainText(`Finding ${todayAsShown()} by kestrel-play`)
  await expect(row.getByRole('button', { name: 'Withdraw finding' })).toBeVisible()
  await expect(page.locator('.tag-finding')).toHaveCount(1)

  await page.getByRole('link', { name: 'Toys' }).click()
  expect(await summaryCounts(page)).toEqual([40, 13, 9, 18])
})

test('Undo right after flagging restores everything', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Flag supplier' }).click()
  await expect(page.locator('.tag-finding')).toHaveCount(1)

  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()

  await expect(page.locator('.tag-finding')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Finding against Lianfa Group withdrawn.')
  await expect(supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' })).toBeVisible()
  await page.getByRole('link', { name: 'Toys' }).click()
  expect(await summaryCounts(page)).toEqual([40, 0, 0, 40])
})

test('Undo is still offered after moving to another page', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Flag supplier' }).click()
  await expect(page.getByRole('status')).toContainText('Lianfa Group flagged.')

  await page.getByRole('link', { name: 'Toys' }).click()
  expect(await summaryCounts(page)).toEqual([40, 13, 9, 18])
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.summary dd').nth(1)).toHaveText('0')
  expect(await summaryCounts(page)).toEqual([40, 0, 0, 40])
})

test('a finding can be withdrawn later from the suppliers list', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL, '/suppliers')

  await supplierRow(page, LIANFA).getByRole('button', { name: 'Withdraw finding' }).click()

  await expect(page.locator('.tag-finding')).toHaveCount(0)
  await expect(supplierRow(page, LIANFA)).toContainText('None')
  await page.getByRole('link', { name: 'Toys' }).click()
  expect(await summaryCounts(page)).toEqual([40, 0, 0, 40])
})

test('the dialog counts only the toys that would change', async ({ page, request }) => {
  // With Lianfa Fabrication already flagged, 9 of the 22 toys are already as exposed as they would be.
  await flagSupplier(request, KESTREL, 'Lianfa Fabrication')
  await openSignedIn(page, KESTREL, '/suppliers')
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('22 toys reach this supplier:')
  await expect(dialog).toContainText('10 would become Affected')
  await expect(dialog).toContainText('3 would become Possibly affected')
  await expect(dialog).toContainText('9 would not change (already exposed through another finding)')
})

test('a flag that fails leaves the screen as it was and says so', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await page.route('**/api/suppliers/*/finding', (route) => route.abort())
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Flag supplier' }).click()

  await expect(dialog.getByRole('alert')).toContainText('Could not flag the supplier.')
  await expect(page.getByRole('status')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.tag-finding')).toHaveCount(0)
})

test('the list can be narrowed to the suppliers with a finding', async ({ page, request }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await page.getByRole('button', { name: 'With a finding 0' }).click()
  await expect(page.getByText('You have not flagged any supplier.')).toBeVisible()
  await page.getByRole('button', { name: 'Show all suppliers' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(49)

  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await page.reload()
  await page.getByRole('button', { name: 'With a finding 1' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(supplierRow(page, LIANFA)).toBeVisible()
})

test('supplier detail says what a finding would do before anything is flagged', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await page.getByRole('link', { name: 'Lianfa Group' }).click()

  await expect(page).toHaveURL(/\/suppliers\/\d+$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lianfa Group SUP-028')
  await expect(page.locator('.why')).toContainText('Headquarters: Turkey · Finding: None')

  const impact = page.getByRole('region', { name: 'Impact' })
  await expect(impact).toContainText('If you flag this supplier, of the 22 toys it reaches:')
  await expect(impact).toContainText('13 would become Affected: it is the only source of a part they use')
  await expect(impact).toContainText('9 would become Possibly affected: another supplier can make the part too')
})

test('supplier detail lists the parts it can make and who else can make them', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await page.getByRole('link', { name: 'Lianfa Group' }).click()

  const parts = page.getByRole('region', { name: 'Parts it can make for you (8)' })
  await expect(parts.locator('tbody tr')).toHaveCount(8)

  const wheel = parts.locator('tbody tr', { hasText: 'PRT-0223' })
  await expect(wheel.locator('td')).toHaveText(['wheel PRT-0223', 'Cavite Plant, Philippines', 'None: only source', '3 toys'])

  const softFilling = parts.locator('tbody tr', { hasText: 'PRT-0117' })
  await expect(softFilling.locator('td')).toHaveText([
    'soft filling PRT-0117',
    'Cavite Plant, Philippines',
    'Everstar Fabrication',
    '7 toys',
  ])
  // The other supplier is one click away.
  await softFilling.getByRole('link', { name: 'Everstar Fabrication' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Everstar Fabrication')
})

test('supplier detail says through which parts each toy is reached', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await page.getByRole('link', { name: 'Lianfa Group' }).click()

  const toys = page.getByRole('region', { name: 'Toys it reaches (22)' })
  await expect(toys.locator('tbody tr')).toHaveCount(22)
  await expect(toys.locator('thead th')).toHaveText(['Toy', 'Through these parts', 'Exposure now', 'If flagged'])

  // Marble Digger: through "wheel" (no other source) and "zip fastener" (Pacific Precision can make it too).
  const marbleDigger = toys.locator('tbody tr', { hasText: 'Marble Digger' })
  await expect(marbleDigger.locator('td').nth(1)).toContainText('wheel only source')
  await expect(marbleDigger.locator('td').nth(1)).toContainText('zip fastener or Pacific Precision')
  await expect(marbleDigger.locator('.badge')).toHaveText(['–No finding', '✕Affected'])

  // Lantern Crane: only through "soft filling", which Everstar Fabrication can also make.
  const lanternCrane = toys.locator('tbody tr', { hasText: 'Lantern Crane' })
  await expect(lanternCrane.locator('td').nth(1)).toHaveText('soft filling or Everstar Fabrication')
  await expect(lanternCrane.locator('.badge')).toHaveText(['–No finding', '?Possibly affected'])

  await marbleDigger.getByRole('link', { name: 'Marble Digger' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Marble Digger')
})

test('flagging from the supplier detail updates the impact and the toys', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await page.getByRole('link', { name: 'Lianfa Group' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lianfa Group SUP-028')

  await page.getByRole('button', { name: 'Flag supplier' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Flag supplier' }).click()

  await expect(page.locator('.why')).toContainText(`Finding ${todayAsShown()} by kestrel-play`)
  const impact = page.getByRole('region', { name: 'Impact' })
  await expect(impact).toContainText('You flagged this supplier. Of the 22 toys it reaches:')
  await expect(impact).toContainText('13 are Affected')
  await expect(impact).toContainText('9 are Possibly affected: check your purchase records')

  // The "If flagged" column is gone: it is flagged.
  const toys = page.getByRole('region', { name: 'Toys it reaches (22)' })
  await expect(toys.locator('thead th')).toHaveText(['Toy', 'Through these parts', 'Exposure now'])
  await expect(toys.locator('tbody .badge')).toHaveText([
    ...Array(13).fill('✕Affected'),
    ...Array(9).fill('?Possibly affected'),
  ])
  await expect(page.getByRole('button', { name: 'Withdraw finding' })).toBeVisible()

  // A refresh lands on the same page with the same state.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Withdraw finding' })).toBeVisible()
})

test('an unknown supplier, or something that is not an id, is "not found"', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers/99999')
  await expect(page.getByText('Supplier not found.')).toBeVisible()
  await page.goto('/suppliers/abc')
  await expect(page.getByText('Supplier not found.')).toBeVisible()
})

test('another Finisher sees no finding on the same supplier, and keeps its own', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')

  await openSignedIn(page, MOONPATH, '/suppliers')
  await expect(supplierRow(page, LIANFA)).toContainText('Lianfa Group')
  await expect(page.locator('.tag-finding')).toHaveCount(0)

  // Moonpath Brands flags the same supplier: its dialog names Moonpath Brands, and the finding is its own.
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' }).click()
  await expect(page.getByRole('dialog')).toContainText('Only Moonpath Brands sees this finding.')
  await page.getByRole('dialog').getByRole('button', { name: 'Flag supplier' }).click()
  await expect(supplierRow(page, LIANFA)).toContainText('by moonpath-brands')

  // Moonpath Brands withdraws its finding. Kestrel Play's is still there.
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Withdraw finding' }).click()
  await expect(page.locator('.tag-finding')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await openSignedIn(page, KESTREL, '/suppliers')
  await expect(supplierRow(page, LIANFA)).toContainText('by kestrel-play')
})

test('flagging and then withdrawing on the same row does not ask again', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Flag supplier' }).click()
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Withdraw finding' }).click()

  await expect(supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('an Undo belongs to the sign-in that made the change: the next user is never offered it', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/suppliers')
  await supplierRow(page, LIANFA).getByRole('button', { name: 'Flag supplier' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Flag supplier' }).click()
  await expect(page.getByRole('status').getByRole('button', { name: 'Undo' })).toBeVisible()

  // Well within the notice's 12 seconds, another Finisher's user signs in on the same tab,
  // without reloading the page.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, MOONPATH)
  await expect(page.locator('.context')).toHaveText('Moonpath Brands · moonpath-brands')
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.getByRole('link', { name: 'Suppliers' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(49)
  await expect(page.getByRole('status')).toHaveCount(0)

  // The same holds for the same user signing in again.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, KESTREL)
  await expect(page.locator('.context')).toHaveText('Kestrel Play · kestrel-play')
  await expect(page.getByRole('status')).toHaveCount(0)
  // And Kestrel Play's finding is untouched.
  await expect(supplierRow(page, LIANFA)).toContainText('by kestrel-play')
})
