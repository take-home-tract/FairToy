import { expect, test } from '@playwright/test'
import { KESTREL, MOONPATH, flagSupplier, openSignedIn, withdrawAllFindings } from './helpers'

test.beforeEach(async ({ request }) => {
  await withdrawAllFindings(request)
})

async function openToy(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
}

test('a toy shows every part and each part’s possible sources', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  await openToy(page, 'Marble Digger')

  await expect(page).toHaveURL(/\/toys\/\d+$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Marble Digger TOY-0290')
  await expect(page.locator('.why')).toHaveText(
    'Why: You have recorded no finding that touches this toy. This does not mean it is safe.',
  )
  // With no findings there is nothing more urgent, so the parts are open.
  await expect(page.getByText('Parts (22)')).toBeVisible()
  await expect(page.locator('.parts-table tbody tr')).toHaveCount(22)
  const wheel = page.locator('.parts-table tbody tr', { hasText: 'PRT-0223' })
  await expect(wheel).toContainText('wheel')
  await expect(wheel.locator('.sources li')).toHaveText(['Lianfa Group (Turkey) — Cavite Plant, Philippines'])
  await expect(page.locator('.tag-finding')).toHaveCount(0)
  // The chain in one sentence.
  await expect(page.locator('.chain-summary')).toHaveText(
    '22 parts from 20 suppliers. 18 parts have a single possible supplier, 4 can come from more than one.',
  )
})

test('the chain can be read by supplier: who the toy cannot do without, and who has alternatives', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  await openToy(page, 'Marble Digger')
  await page.getByRole('button', { name: 'By supplier' }).click()
  await expect(page).toHaveURL(/\/toys\/\d+\?view=supplier$/)

  const onlySource = page.getByRole('region', { name: /^Only source of a part/ })
  await expect(onlySource).toContainText('A finding against one of these would make this toy Affected.')
  const lianfa = onlySource.locator('tbody tr', { hasText: 'Lianfa Group' })
  await expect(lianfa.locator('td').nth(1)).toContainText('wheel PRT-0223 only source')
  await expect(lianfa.locator('td').nth(1)).toContainText('zip fastener PRT-0044 or Pacific Precision')

  const several = page.getByRole('region', { name: /^One of several sources/ })
  await expect(several).toContainText('A finding against one of these would make this toy Possibly affected.')
  await expect(several.locator('tbody tr', { hasText: 'Pacific Precision' }).locator('td').nth(1)).toHaveText(
    'zip fastener PRT-0044 or Lianfa Group',
  )

  // The view is in the URL, so it survives a refresh.
  await page.reload()
  await expect(page.getByRole('button', { name: 'By supplier' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: /^Only source of a part/ })).toBeVisible()
})

test('a supplier can be flagged from the toy, and the toy updates', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  await openToy(page, 'Marble Digger')
  await page.getByRole('button', { name: 'By supplier' }).click()

  await page
    .getByRole('region', { name: /^Only source of a part/ })
    .locator('tbody tr', { hasText: 'Lianfa Group' })
    .getByRole('button', { name: 'Flag supplier' })
    .click()
  await expect(page.getByRole('dialog')).toContainText('13 would become Affected')
  await page.getByRole('dialog').getByRole('button', { name: 'Flag supplier' }).click()

  await expect(page.locator('.title-row .badge')).toHaveText('✕Affected')
  const flagged = page.getByRole('region', { name: 'Flagged (1)' })
  await expect(flagged.locator('tbody tr')).toContainText('Lianfa Group')
  await expect(flagged.getByRole('button', { name: 'Withdraw finding' })).toBeVisible()

  await flagged.getByRole('button', { name: 'Withdraw finding' }).click()
  await expect(page.locator('.title-row .badge')).toHaveText('–No finding')
  await expect(page.getByRole('region', { name: 'Flagged (1)' })).toHaveCount(0)
})

test('an affected toy says why and shows the path to the flagged supplier', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL)
  await openToy(page, 'Marble Digger')

  await expect(page.locator('.title-row .badge')).toHaveText('✕Affected')
  await expect(page.locator('.why')).toHaveText(
    'Why: The part “wheel” can only come from Lianfa Group, which you flagged.',
  )

  const touched = page.getByRole('region', { name: 'Parts touched by a finding (2)' })
  await expect(touched.locator('.part')).toHaveCount(2)

  const wheel = touched.locator('.part').nth(0)
  await expect(wheel).toContainText('wheel PRT-0223')
  await expect(wheel.locator('.badge')).toHaveText('✕Affected')
  await expect(wheel.locator('.sources li')).toHaveText(['Lianfa Group (Turkey) — Cavite Plant, PhilippinesFinding'])

  const zip = touched.locator('.part').nth(1)
  await expect(zip).toContainText('zip fastener PRT-0044')
  await expect(zip.locator('.badge')).toHaveText('?Possibly affected')
  await expect(zip.locator('.sources li')).toHaveText([
    'Lianfa Group (Turkey) — Rayong Plant, ThailandFinding',
    'Pacific Precision (Vietnam) — Katowice Plant, Poland',
  ])
  await expect(zip).toContainText('We cannot tell which supplier made it. Check your purchase records.')

  // The other parts are collapsed, and can be opened.
  const others = page.locator('details.other-parts')
  await expect(others.locator('summary')).toHaveText('Other parts (20)')
  await expect(others.locator('tbody tr').first()).toBeHidden()
  await others.locator('summary').click()
  await expect(others.locator('tbody tr')).toHaveCount(20)
  await expect(others.locator('tbody tr').first()).toBeVisible()
})

test('a possibly affected toy names the alternative supplier', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL)
  await openToy(page, 'Lantern Crane')

  await expect(page.locator('.title-row .badge')).toHaveText('?Possibly affected')
  await expect(page.locator('.why')).toHaveText(
    'Why: “soft filling” can come from Lianfa Group (flagged) or Everstar Fabrication. We cannot tell which was used. Check your purchase records.',
  )
  const touched = page.getByRole('region', { name: 'Parts touched by a finding (1)' })
  await expect(touched.locator('.sources li')).toHaveText([
    'Lianfa Group (Turkey) — Cavite Plant, PhilippinesFinding',
    'Everstar Fabrication (Thailand) — Katowice Plant, Poland',
  ])
})

test('the trace has its own URL and leads on to the supplier and back to the toys', async ({ page, request }) => {
  await flagSupplier(request, KESTREL, 'Lianfa Group')
  await openSignedIn(page, KESTREL)
  await openToy(page, 'Lantern Crane')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lantern Crane')

  await page.getByRole('region', { name: /Parts touched/ }).getByRole('link', { name: 'Lianfa Group' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lianfa Group SUP-028')

  await page.goBack()
  await page.getByRole('link', { name: '‹ Toys' }).click()
  await expect(page).toHaveURL(/\/toys$/)
})

test('an unknown toy, or something that is not an id, is "not found"', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/toys/99999')
  await expect(page.getByText('Toy not found.')).toBeVisible()
  await page.goto('/toys/abc')
  await expect(page.getByText('Toy not found.')).toBeVisible()
})

test('the same toy URL shows each Finisher its own toy, or nothing', async ({ page }) => {
  // Kestrel Play has 40 toys, Moonpath Brands 37: toy 40 exists only for Kestrel Play.
  await openSignedIn(page, KESTREL, '/toys/40')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const kestrelToy = await page.getByRole('heading', { level: 1 }).textContent()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await openSignedIn(page, MOONPATH, '/toys/40')
  await expect(page.getByText('Toy not found.')).toBeVisible()

  await page.goto('/toys/1')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const moonpathToy = await page.getByRole('heading', { level: 1 }).textContent()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await openSignedIn(page, KESTREL, '/toys/1')
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(moonpathToy!)
  expect(kestrelToy).not.toEqual(moonpathToy)
})
