import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.EMS_VERIFY_URL || 'http://127.0.0.1:8080'
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(20000)
  page.setDefaultNavigationTimeout(30000)
  await page.route('https://fonts.googleapis.com/**', route => route.abort())
  await page.route('https://fonts.gstatic.com/**', route => route.abort())
  const errors = []
  const requests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (request.url().includes('/api/v1/')) requests.push(new URL(request.url()).pathname)
  })
  const login = await page.request.post(`${base}/api/v1/auth/login`, {
    data: { username: process.env.EMS_VERIFY_USER || 'docente', password: process.env.EMS_VERIFY_PASSWORD || 'teacher-change-me' },
  })
  assert.ok(login.ok())
  const auth = await login.json()
  if (process.env.EMS_VERIFY_CONNECTED) {
    const response = await page.request.get(`${base}/api/v1/deployment/4g-epc/connectivity`, {
      headers: { Authorization: `Bearer ${auth.access_token}` },
    })
    assert.ok(response.ok())
    const readiness = await response.json()
    for (const id of process.env.EMS_VERIFY_CONNECTED.split(',')) {
      assert.equal(readiness.nodes.find(node => node.id === id)?.status, 'connected', `${id} must have verified live SSH`)
    }
  }
  await page.context().addCookies([
    { name: 'thisisjustarandomstring', value: JSON.stringify(auth.access_token), url: base },
    { name: 'ems-user', value: JSON.stringify(auth.user), url: base },
  ])
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  console.log('Page loaded')
  const selector = page.getByRole('combobox', { name: 'Escenario global' })
  try {
    await selector.waitFor()
  } catch (error) {
    console.log({ errors, text: await page.locator('body').innerText() })
    throw error
  }
  await selector.click()
  await page.getByRole('option', { name: '4G EPC', exact: true }).click()
  await page.getByRole('heading', { name: 'Laboratorio 4G · Conectividad' }).waitFor()
  await page.getByText('EMS-UE-4G', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-slot="card"]').count(), 5)
  if (process.env.EMS_VERIFY_CONNECTED) {
    assert.ok(await page.getByText('Conectada', { exact: true }).count() >= process.env.EMS_VERIFY_CONNECTED.split(',').length,
      'The web UI must show the live verified connections')
  }
  const initial = await page.locator('main').innerText()
  assert.match(initial, /EPC y srsRAN pendientes/)
  assert.match(initial, /10.210.40.11/)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Laboratorio 4G · Conectividad' }).waitFor()
  await selector.click()
  await page.getByRole('option', { name: '5G Standalone', exact: true }).click()
  await page.getByRole('heading', { name: 'Sin laboratorio desplegado' }).waitFor()
  assert.equal(await page.locator('[data-slot="card"]').count(), 0)
  // Deep links cannot bypass the deployment gate and mount the old NF views.
  await page.goto(`${base}/topology`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Sin laboratorio desplegado' }).waitFor()
  await selector.click()
  await page.getByRole('option', { name: '4G EPC', exact: true }).click()
  await page.getByText('EMS-UE-4G', { exact: true }).waitFor()
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`)
  }
  assert.ok(requests.every(path => path.includes('/deployment') || path.endsWith('/auth/login')), JSON.stringify(requests))
  assert.deepEqual(errors, [])
  if (process.env.EMS_VERIFY_SCREENSHOT) await page.screenshot({ path: process.env.EMS_VERIFY_SCREENSHOT, fullPage: true })
  console.log('PASS: 4G cards, persistent selector, empty 5G, deep-link isolation, no NF requests, responsive layout.')
} finally {
  await browser.close()
}
