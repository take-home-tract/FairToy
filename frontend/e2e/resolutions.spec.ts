import { expect, test, type Page } from '@playwright/test'
import { KESTREL, MOONPATH, flagSupplier, openSignedIn, resetData, resolvePart, summaryCounts, todayAsShown } from './helpers'

// With Lianfa Group flagged, Lantern Crane (TOY-0029) is possibly affected: its "soft filling"
// (PRT-0117) can come from Lianfa Group or Everstar Fabrication. Purchase records settle which.

test.beforeEach(async ({ request }) => {
  await resetData(request)
})

async function openLanternCrane(page: Page) {
  await page.getByRole('link', { name: 'Lantern Crane' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lantern Crane')
}

const choices = (page: Page) => page.getByRole('group', { name: 'Which supplier made the soft filling?' })

test('a possibly affected part asks which supplier made it', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL)
  await openLanternCrane(page)

  await expect(choices(page).getByRole('button')).toHaveText(['Lianfa Group (flagged)', 'Everstar Fabrication'])
})

test('recording the unflagged supplier clears the toy, and keeps who and when', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL)
  await openLanternCrane(page)

  await choices(page).getByRole('button', { name: 'Everstar Fabrication' }).click()

  await expect(page.getByRole('status')).toContainText('Recorded: “soft filling” came from Everstar Fabrication.')
  await expect(page.locator('.title-row .badge')).toHaveText('–No finding')
  await expect(page.locator('.why')).toContainText('You recorded which supplier made 1 part, and none of them is flagged.')

  const resolved = page.getByRole('region', { name: 'Parts you resolved (1)' })
  const part = resolved.locator('.part')
  await expect(part).toContainText('soft filling PRT-0117')
  await expect(part.locator('.resolution')).toContainText(`Made by Everstar Fabrication · recorded ${todayAsShown()} by kestrel-play`)
  // Both sources stay listed: one used, one not.
  await expect(part.locator('.sources li')).toHaveText([
    'Lianfa Group (Turkey) — Cavite Plant, PhilippinesFinding not used',
    'Everstar Fabrication (Thailand) — Katowice Plant, PolandUsed',
  ])
  await expect(choices(page)).toHaveCount(0)

  await page.getByRole('link', { name: 'Toys', exact: true }).click()
  expect(await summaryCounts(page)).toEqual([40, 13, 8, 19])
  await expect(page.locator('tbody tr', { hasText: 'Lantern Crane' })).toContainText('1 part resolved')
})

test('recording the flagged supplier makes the toy affected', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL)
  await openLanternCrane(page)

  await choices(page).getByRole('button', { name: 'Lianfa Group (flagged)' }).click()

  await expect(page.locator('.title-row .badge')).toHaveText('✕Affected')
  await expect(page.locator('.why')).toHaveText(
    'Why: The part “soft filling” came from Lianfa Group, which you flagged. You recorded this from your purchase records.',
  )
  const touched = page.getByRole('region', { name: 'Parts touched by a finding (1)' })
  await expect(touched.locator('.resolution')).toContainText('Made by Lianfa Group')

  await page.getByRole('link', { name: 'Toys', exact: true }).click()
  expect(await summaryCounts(page)).toEqual([40, 14, 8, 18])
})

test('Undo right after recording restores possibly affected', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL)
  await openLanternCrane(page)
  await choices(page).getByRole('button', { name: 'Everstar Fabrication' }).click()
  await expect(page.locator('.title-row .badge')).toHaveText('–No finding')

  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()

  await expect(page.locator('.title-row .badge')).toHaveText('?Possibly affected')
  await expect(choices(page)).toBeVisible()
})

test('a resolution can be withdrawn later', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await resolvePart(request, KESTREL, 'TOY-0029', 'PRT-0117', 'Everstar Fabrication')
  await openSignedIn(page, KESTREL)
  await openLanternCrane(page)

  await page.getByRole('region', { name: 'Parts you resolved (1)' }).getByRole('button', { name: 'Withdraw' }).click()

  await expect(page.getByRole('status')).toContainText('Supplier of “soft filling” no longer recorded.')
  await expect(page.locator('.title-row .badge')).toHaveText('?Possibly affected')
  await page.getByRole('link', { name: 'Toys', exact: true }).click()
  expect(await summaryCounts(page)).toEqual([40, 13, 9, 18])
})

test('a resolution outlives findings: the toy follows the supplier that made the part', async ({ page, request }) => {
  await resolvePart(request, KESTREL, 'TOY-0029', 'PRT-0117', 'Everstar Fabrication')
  await flagSupplier(request, KESTREL, 'Everstar Fabrication')
  await openSignedIn(page, KESTREL)
  await openLanternCrane(page)

  await expect(page.locator('.title-row .badge')).toHaveText('✕Affected')
  await expect(page.locator('.why')).toContainText('The part “soft filling” came from Everstar Fabrication, which you flagged.')
})

test('by supplier, a resolved part shows only the supplier that made it', async ({ page, request }) => {
  await resolvePart(request, KESTREL, 'TOY-0029', 'PRT-0117', 'Everstar Fabrication')
  await openSignedIn(page, KESTREL)
  await openLanternCrane(page)
  await page.getByRole('button', { name: 'By supplier' }).click()

  const everstar = page.locator('tbody tr', { hasText: 'Everstar Fabrication' })
  await expect(everstar.locator('td').nth(1)).toContainText('soft filling PRT-0117 Used')
  await expect(page.locator('tbody tr', { hasText: 'Lianfa Group' })).toHaveCount(0)
})

test('the flag preview takes resolutions into account', async ({ page, request }) => {
  // Lantern Crane reaches Lianfa Group only through soft filling. Once it is known to come from
  // Everstar Fabrication, flagging Lianfa Group no longer touches Lantern Crane.
  await resolvePart(request, KESTREL, 'TOY-0029', 'PRT-0117', 'Everstar Fabrication')
  await openSignedIn(page, KESTREL, '/suppliers')
  await page.getByRole('link', { name: 'Lianfa Group' }).click()

  const impact = page.getByRole('region', { name: 'Impact' })
  await expect(impact).toContainText('of the 21 toys it reaches:')
  await expect(impact).toContainText('8 would become Possibly affected')
  await expect(page.getByRole('region', { name: 'Toys it reaches (21)' })).not.toContainText('Lantern Crane')
})

test('another Finisher sees none of it', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await resolvePart(request, KESTREL, 'TOY-0029', 'PRT-0117', 'Everstar Fabrication')
  await openSignedIn(page, MOONPATH)
  await expect(page.locator('tbody')).not.toContainText('resolved')
  expect(await summaryCounts(page)).toEqual([37, 0, 0, 37])
})
