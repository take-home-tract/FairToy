import { expect, test } from '@playwright/test'
import { KESTREL, MOONPATH, flagSupplier, openSignedIn, summaryCounts, withdrawAllFindings } from './helpers'

// Numbers from the sample data: Kestrel Play has 40 toys. Lianfa Group reaches
// 22 of them: 13 affected, 9 possibly affected (docs/ux.md).

test.beforeEach(async ({ request }) => {
  await withdrawAllFindings(request)
})

test('with no findings, every toy has no finding and the page says how to start', async ({ page }) => {
  await openSignedIn(page, KESTREL)

  expect(await summaryCounts(page)).toEqual([40, 0, 0, 40])
  await expect(page.locator('tbody tr')).toHaveCount(40)
  await expect(page.locator('tbody .badge')).toHaveText(Array(40).fill('–No finding'))
  await expect(page.getByText('No findings recorded yet. Flag a supplier to see which toys it reaches.')).toBeVisible()
})

test('"no finding" is never shown as safe', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  await expect(page.locator('tbody tr')).toHaveCount(40)

  await expect(page.locator('main')).not.toContainText(/safe/i)
  await expect(page.locator('.summary')).toContainText('No finding in its chain')
  // The only mention of "safe" is the explanation that it does not mean safe.
  await expect(page.locator('tbody .badge').first()).toHaveAttribute('title', /This does not mean it is safe\./)
})

test('after a finding against Lianfa Group: 13 affected, 9 possibly affected, 18 no finding', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL)

  expect(await summaryCounts(page)).toEqual([40, 13, 9, 18])
  await expect(page.getByText('No findings recorded yet.')).toHaveCount(0)

  // Sorted by exposure: affected first, then possibly affected, then no finding.
  // Each badge is a symbol and a word, not only a color.
  await expect(page.locator('tbody .badge')).toHaveText([
    ...Array(13).fill('✕Affected'),
    ...Array(9).fill('?Possibly affected'),
    ...Array(18).fill('–No finding'),
  ])

  const marbleDigger = page.locator('tbody tr', { hasText: 'Marble Digger' })
  await expect(marbleDigger).toContainText('TOY-0290')
  await expect(marbleDigger).toContainText('Affected')
  await expect(marbleDigger).toContainText('2 of 22')
})

test('the exposure filter narrows the list, lives in the URL and survives a refresh', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL)
  const filters = page.getByRole('group', { name: 'Filter by exposure' })

  await filters.getByRole('button', { name: 'Possibly affected 9' }).click()
  await expect(page).toHaveURL(/\/toys\?exposure=possibly_affected$/)
  await expect(page.locator('tbody tr')).toHaveCount(9)
  await expect(page.locator('tbody .badge')).toHaveText(Array(9).fill('?Possibly affected'))

  await page.reload()
  await expect(page.locator('tbody tr')).toHaveCount(9)
  await expect(filters.getByRole('button', { name: 'Possibly affected 9' })).toHaveAttribute('aria-pressed', 'true')
  // The counts at the top do not change with the filter.
  expect(await summaryCounts(page)).toEqual([40, 13, 9, 18])

  await filters.getByRole('button', { name: 'Affected 13', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(13)
  await filters.getByRole('button', { name: 'No finding 18' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(18)
  await filters.getByRole('button', { name: 'All 40' }).click()
  await expect(page).toHaveURL(/\/toys$/)
  await expect(page.locator('tbody tr')).toHaveCount(40)
})

test('an unknown filter in the URL is ignored', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/toys?exposure=safe')
  await expect(page.locator('tbody tr')).toHaveCount(40)
  await expect(page.getByRole('button', { name: 'All 40' })).toHaveAttribute('aria-pressed', 'true')
})

test('search finds a toy by name or by code', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  const search = page.getByRole('searchbox', { name: 'Search toys by name or code' })

  await search.fill('lantern cr')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody tr')).toContainText('Lantern Crane')

  await search.fill('toy-0290')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody tr')).toContainText('Marble Digger')
})

test('a search with no result says what was searched and offers to clear it', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL, '/toys?exposure=affected')

  await page.getByRole('searchbox').fill('no such toy')
  await expect(page.locator('table')).toHaveCount(0)
  await expect(page.getByText('Nothing matches “no such toy” in “Affected”.')).toBeVisible()

  await page.getByRole('button', { name: 'Show all toys' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(40)
  await expect(page).toHaveURL(/\/toys$/)
})

test('a finding by one Finisher changes nothing on another Finisher’s page', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')

  await openSignedIn(page, MOONPATH)
  expect(await summaryCounts(page)).toEqual([37, 0, 0, 37])
  await expect(page.getByText('No findings recorded yet.')).toBeVisible()
})

test('when the API cannot be reached, the page says so and offers a retry', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  await page.route('**/api/toys', (route) => route.abort())
  await page.reload()

  await expect(page.getByRole('alert')).toContainText('Could not load your toys.')
  await page.unroute('**/api/toys')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(40)
})
