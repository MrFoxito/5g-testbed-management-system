import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Catalog/query fixtures only. No collector, configuration or saved-query writes.
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } })
  const errors = []
  const queries = []
  page.on('pageerror', error => errors.push(error.message))
  const login = await page.request.post('http://127.0.0.1:8000/api/v1/auth/login', { data: {
    username: process.env.EMS_VERIFY_USER || 'docente', password: process.env.EMS_VERIFY_PASSWORD || 'teacher-change-me',
  } })
  assert.ok(login.ok())
  const auth = await login.json()
  await page.context().addCookies([
    { name: 'thisisjustarandomstring', value: JSON.stringify(auth.access_token), url: 'http://127.0.0.1:5173' },
    { name: 'ems-user', value: JSON.stringify(auth.user), url: 'http://127.0.0.1:5173' },
  ])
  const objects = [{ id: 'testbed:local', label: 'ems-testbed', type: 'testbed', group: 'Testbed' }, ...['nrf','scp','amf'].map(id => ({ id: `nf:${id}`, label: id.toUpperCase(), type: 'nf', group: 'Funciones de red' }))]
  const counter = (id, label, source, object, category) => ({ id, label, source, object_ids: [object], objects: [object.split(':')[0]], category, unit: '%', kind: 'gauge' })
  const counters = [counter('host.cpu.percent','CPU VM','runtime','testbed:local','Host'), ...['nrf','scp','amf'].map(id => counter(`nf.process.${id}.cpu_percent`,'CPU del proceso','systemd /proc',`nf:${id}`,'Recursos del proceso')), counter('native.amf.registration','Registros AMF','Open5GS /metrics','nf:amf','AMF nativo')]
  await page.route('**/api/v1/performance/**', async route => {
    const url = route.request().url()
    if (url.includes('/catalog/')) return route.fulfill({ json: { scenario_id:'5g-sa',testbed_id:'local',objects,counters,collector:{ interval_seconds:10, retention_days:30, stored_samples:0 } } })
    if (url.endsWith('/query')) { queries.push(route.request().postDataJSON());return route.fulfill({ json:{series:[],sample_count:0} }) }
    if (route.request().method() !== 'GET') throw Error('Unexpected mutation')
    return route.fulfill({ json:[] })
  })
  await page.goto('http://127.0.0.1:5173/performance')
  await page.getByRole('button',{name:'Nueva consulta',exact:true}).click()
  await page.getByRole('heading',{name:'Nueva consulta',exact:true}).waitFor()
  assert.equal(await page.getByRole('dialog').count(),0)
  const choose = async nf => {
    await page.getByLabel('Tipo de elemento').click()
    await page.getByRole('option',{name:nf,exact:true}).click()
  }
  await choose('NRF')
  await page.getByRole('checkbox',{name:/NRF/}).check()
  await page.getByRole('button',{name:'Siguiente',exact:true}).click()
  await page.getByText(/Esta NF no tiene contadores de servicio/).waitFor()
  assert.equal(await page.getByRole('checkbox').count(),0)
  await page.getByRole('button',{name:'Operación y recursos',exact:true}).click()
  await page.getByRole('checkbox',{name:/CPU del proceso/}).check()
  await page.getByRole('button',{name:'Anterior',exact:true}).click()
  await choose('SCP')
  await page.getByText('Objetos seleccionados (0)',{exact:true}).waitFor()
  assert.equal(await page.getByRole('checkbox',{name:/NRF/}).count(),0)
  await choose('AMF')
  await page.getByRole('checkbox',{name:/AMF/}).check()
  await page.getByRole('button',{name:'Siguiente',exact:true}).click()
  assert.equal(await page.getByRole('checkbox',{name:/CPU/}).count(),0)
  await page.getByRole('checkbox',{name:/Registros AMF/}).check()
  await page.screenshot({path:'../reportes/performance-consulta-vista.png',fullPage:true})
  await page.getByRole('button',{name:'Siguiente',exact:true}).click()
  await page.getByRole('button',{name:'Ejecutar consulta',exact:true}).click()
  await page.getByRole('button',{name:'Nueva consulta',exact:true}).waitFor()
  await page.waitForTimeout(200)
  assert.deepEqual(queries.at(-1).object_ids,['nf:amf'])
  assert.deepEqual(queries.at(-1).counter_ids,['native.amf.registration'])
  await page.getByRole('checkbox',{name:'NRF',exact:true}).check()
  assert.ok(!(await page.getByRole('checkbox',{name:'AMF',exact:true}).isChecked()))
  assert.ok(!(await page.getByRole('checkbox',{name:'ems-testbed',exact:true}).isChecked()))
  await page.getByRole('button',{name:'Nueva consulta',exact:true}).click()
  for (const width of [1600,768,390]) {
    await page.setViewportSize({width,height:1050})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),'No overflow '+width)
  }
  await page.getByRole('button',{name:'Cancelar',exact:true}).click()
  assert.deepEqual(errors,[])
  console.log('PASS: full-page wizard, exclusive NF domains, no host/NF mixing, native versus operational counters, empty service state, execute/cancel and responsive layout.')
} finally { await browser.close() }
