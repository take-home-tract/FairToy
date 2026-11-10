import { expect, test } from '@playwright/test'
import { KESTREL, signIn, summaryCounts, supplierRow, withdrawAllFindings } from './helpers'

test.beforeEach(async ({ request }) => {
  await withdrawAllFindings(request)
})

// The walkthrough in docs/ux.md, step by step: Maria works at Kestrel Play, and a report names Lianfa Group.
test('walkthrough: flag a reported supplier, see what it touches and why, then undo', async ({ page }) => {
  // 1. She opens FairToy and signs in. The top bar shows her Finisher.
  await page.goto('/')
  await signIn(page, KESTREL)
  await expect(page.locator('.context')).toHaveText('Kestrel Play · kestrel-play')

  // 2. She opens Suppliers and searches "Lianfa".
  await page.getByRole('link', { name: 'Suppliers' }).click()
  await page.getByRole('searchbox').fill('Lianfa')
  await expect(supplierRow(page, 'SUP-028')).toContainText('Lianfa Group')

  // 3. She presses Flag supplier. The dialog says what would change.
  await supplierRow(page, 'SUP-028').getByRole('button', { name: 'Flag supplier' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('22 toys reach this supplier:')
  await expect(dialog).toContainText('13 would become Affected')
  await expect(dialog).toContainText('9 would become Possibly affected')

  // 4. She confirms. A message says it is flagged, with Undo.
  await dialog.getByRole('button', { name: 'Flag supplier' }).click()
  await expect(page.getByRole('status')).toContainText('Lianfa Group flagged.')
  await expect(page.getByRole('status').getByRole('button', { name: 'Undo' })).toBeVisible()

  // 5. She opens Toys, filtered to Affected. 13 toys are listed.
  await page.getByRole('link', { name: 'Toys' }).click()
  await page.getByRole('button', { name: 'Affected 13', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(13)

  // 6. She opens Marble Digger.
  await page.getByRole('link', { name: 'Marble Digger' }).click()
  await expect(page.locator('.why')).toHaveText(
    'Why: The part “wheel” can only come from Lianfa Group, which you flagged.',
  )
  await expect(page.locator('.part', { hasText: 'PRT-0044' }).locator('.badge')).toHaveText('?Possibly affected')

  // 7. She opens Lantern Crane.
  await page.getByRole('link', { name: '‹ Toys' }).click()
  await page.getByRole('link', { name: 'Lantern Crane' }).click()
  await expect(page.locator('.why')).toHaveText(
    'Why: “soft filling” can come from Lianfa Group (flagged) or Everstar Fabrication. We cannot tell which was used. Check your purchase records.',
  )

  // 8. It was the wrong supplier: she withdraws the finding on the supplier.
  await page.getByRole('link', { name: 'Suppliers' }).click()
  await supplierRow(page, 'SUP-028').getByRole('button', { name: 'Withdraw finding' }).click()
  await expect(supplierRow(page, 'SUP-028')).toContainText('None')
  await page.getByRole('link', { name: 'Toys' }).click()
  expect(await summaryCounts(page)).toEqual([40, 0, 0, 40])
})
