import { expect, test } from '@playwright/test'
import { KESTREL, MOONPATH, openSignedIn, signIn, summaryCounts, resetData } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetData(request)
})

test('a signed-out visitor is sent to sign in, and returns to the same page afterwards', async ({ page }) => {
  await page.goto('/toys?exposure=affected')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'FairToy' })).toBeVisible()

  await signIn(page, KESTREL)
  await expect(page).toHaveURL(/\/toys\?exposure=affected$/)
})

test('the start page leads to Toys', async ({ page }) => {
  await openSignedIn(page, KESTREL, '/')
  await expect(page).toHaveURL(/\/toys$/)
  await expect(page.getByRole('heading', { name: 'Your toys' })).toBeVisible()
})

test('a wrong password and an unknown user get the same message', async ({ page }) => {
  await page.goto('/login')

  await signIn(page, KESTREL, 'not-the-password')
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password.')
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page, 'nobody-at-all')
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password.')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

test('the top bar always shows the Finisher and the user', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  await expect(page.locator('.context')).toHaveText('Kestrel Play · kestrel-play')
})

test('the sign-in survives a refresh', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  await page.reload()
  await expect(page.locator('.context')).toHaveText('Kestrel Play · kestrel-play')
  await expect(page).toHaveURL(/\/toys$/)
})

test('signing out discards the token and closes the app', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => sessionStorage.getItem('fairtoy.token'))).toBeNull()

  await page.goto('/toys')
  await expect(page).toHaveURL(/\/login$/)
})

test('a token the API refuses sends the user back to sign in', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  await page.evaluate(() => sessionStorage.setItem('fairtoy.token', 'not-a-valid-token'))
  await page.reload()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => sessionStorage.getItem('fairtoy.token'))).toBeNull()
})

test('signing in as another user shows only that Finisher', async ({ page }) => {
  await openSignedIn(page, KESTREL)
  expect(await summaryCounts(page)).toEqual([40, 0, 0, 40])
  const kestrelToy = await page.locator('tbody tr td').first().textContent()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, MOONPATH)

  await expect(page.locator('.context')).toHaveText('Moonpath Brands · moonpath-brands')
  expect(await summaryCounts(page)).toEqual([37, 0, 0, 37])
  await expect(page.locator('tbody tr')).toHaveCount(37)
  await expect(page.locator('tbody tr td').first()).not.toHaveText(kestrelToy!)
})
