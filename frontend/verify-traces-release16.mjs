import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, channel: 'msedge' })
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const login = await page.request.post('http://127.0.0.1:8000/api/v1/auth/login', {
    data: { username: process.env.EMS_VERIFY_USER || 'docente', password: process.env.EMS_VERIFY_PASSWORD || 'teacher-change-me' },
  })
  assert.ok(login.ok())
  const auth = await login.json()
  await page.context().addCookies([
    { name: 'thisisjustarandomstring', value: JSON.stringify(auth.access_token), url: 'http://127.0.0.1:5173' },
    { name: 'ems-user', value: JSON.stringify(auth.user), url: 'http://127.0.0.1:5173' },
  ])
  const list = await page.request.get('http://127.0.0.1:8000/api/v1/traces', { headers: { Authorization: `Bearer ${auth.access_token}` } })
  const tasks = await list.json()
  const task = tasks.find(t => t.name === 'UE-TRACE-022750')
  assert.ok(task, 'Existing trace required; never create or restart a capture in this check')
  const result = await page.request.get(`http://127.0.0.1:8000/api/v1/traces/${task.id}/analysis`, {
    headers: { Authorization: `Bearer ${auth.access_token}` }, timeout: 90000,
  })
  assert.ok(result.ok(), `Analysis HTTP ${result.status()}`)
  const analysis = await result.json()
  assert.equal(analysis.analysis_policy, '5gs-r16-evidence-v2')
  assert.equal(analysis.standards_review.timers, 'not-assessed')
  assert.ok(analysis.events.length > 0)
  assert.ok(analysis.events.every(e => !e.id.includes('-radio-')))
  await page.goto('http://127.0.0.1:5173/traces')
  await page.getByRole('tab', { name: 'Tareas', exact: true }).click()
  await page.getByText(task.name, { exact: true }).click()
  await page.getByRole('button', { name: 'Descargar', exact: true }).waitFor()
  const message = page.locator('svg g[role="button"]').first()
  await message.waitFor()
  assert.equal(await page.locator('main [role="tab"]').count(), 0)
  assert.equal(await page.getByText('Identificadores correlacionados', { exact: true }).count(), 0)
  await message.locator('rect').click()
  await page.getByText('TS 23.501', { exact: true }).waitFor()
  await page.getByText('Evidencia observada · timers no evaluados · no certifica conformidad', { exact: true }).waitFor()
  await page.screenshot({ path: '../reportes/release16/traza-revisada.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log(`PASS: ${analysis.events.length} observed events, R16 references, no synthetic radio, clean detail view. No capture or NF restart.`)
} finally {
  await browser.close()
}
