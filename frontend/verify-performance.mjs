import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, channel: 'msedge' })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const login = await page.request.post('http://127.0.0.1:8000/api/v1/auth/login', {
    data: { username: process.env.EMS_VERIFY_USER || 'docente', password: process.env.EMS_VERIFY_PASSWORD || 'teacher-change-me' },
  })
  if (!login.ok()) throw new Error('Login failed')
  const auth = await login.json()
  await page.context().addCookies([
    { name: 'thisisjustarandomstring', value: JSON.stringify(auth.access_token), url: 'http://127.0.0.1:5173' },
    { name: 'ems-user', value: JSON.stringify(auth.user), url: 'http://127.0.0.1:5173' },
  ])
  await page.goto('http://127.0.0.1:5173/performance')
  await page.getByText('Biblioteca KPI', { exact: true }).waitFor({ timeout: 45000 })
  await page.getByRole('button', { name: /^AMF ·/ }).waitFor({ timeout: 30000 })
  const query = page.waitForResponse((r) => r.url().endsWith('/performance/query') && r.request().method() === 'POST')
  await page.getByRole('button', { name: /^AMF ·/ }).click()
  const response = await query
  const result = await response.json()
  await page.waitForTimeout(1500)
  console.log(JSON.stringify({ status: response.status(), samples: result.sample_count, series: result.series?.map((s) => ({ label: s.label, last: s.points.at(-1)?.value })), errors }))
  await page.screenshot({ path: '../reportes/2026-09-06_performance_amf.png', fullPage: true })
} finally { await browser.close() }
