import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const PASSWORD = 'fairtoy-demo'
export const KESTREL = 'kestrel-play' // 40 toys
export const MOONPATH = 'moonpath-brands' // 37 toys

/** Sign in through the sign-in page. */
export async function signIn(page: Page, username: string, password = PASSWORD) {
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Open a page and sign in when the app asks for it. */
export async function openSignedIn(page: Page, username: string, path = '/toys') {
  await page.goto(path)
  await signIn(page, username)
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

// --- talking to the API directly, to prepare or clean up data ---

async function authHeaders(request: APIRequestContext, username: string) {
  const response = await request.post('/api/auth/login', { data: { username, password: PASSWORD } })
  expect(response.ok()).toBeTruthy()
  return { Authorization: `Bearer ${(await response.json()).token}` }
}

interface SupplierRow {
  id: number
  name: string
  finding: unknown
}

async function suppliersOf(request: APIRequestContext, headers: Record<string, string>): Promise<SupplierRow[]> {
  return (await (await request.get('/api/suppliers', { headers })).json()).suppliers
}

/** Record a finding against a supplier, as the given user, without going through the UI. */
export async function flagSupplier(request: APIRequestContext, username: string, supplierName: string) {
  const headers = await authHeaders(request, username)
  const supplier = (await suppliersOf(request, headers)).find((s) => s.name === supplierName)
  expect(supplier, `supplier ${supplierName}`).toBeTruthy()
  const response = await request.put(`/api/suppliers/${supplier!.id}/finding`, { headers })
  expect(response.ok()).toBeTruthy()
}

/** Withdraw every finding of the given users, so each test starts from a clean state. */
export async function withdrawAllFindings(request: APIRequestContext, usernames = [KESTREL, MOONPATH]) {
  for (const username of usernames) {
    const headers = await authHeaders(request, username)
    for (const supplier of await suppliersOf(request, headers)) {
      if (supplier.finding) await request.delete(`/api/suppliers/${supplier.id}/finding`, { headers })
    }
  }
}

/** The four numbers at the top of the Toys page: total, affected, possibly affected, no finding. */
export async function summaryCounts(page: Page): Promise<number[]> {
  await expect(page.locator('.summary dd')).toHaveCount(4)
  return (await page.locator('.summary dd').allTextContents()).map(Number)
}

/** The row of a supplier in the Suppliers table, by its code (names can share a prefix). */
export function supplierRow(page: Page, code: string) {
  return page.locator('tbody tr', { hasText: code })
}

/** Today as the UI shows dates: "10 Nov 2026". */
export function todayAsShown(): string {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
