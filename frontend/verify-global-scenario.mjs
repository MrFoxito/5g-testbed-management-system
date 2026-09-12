import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true,channel:'msedge'})
try {
  const page=await browser.newPage({viewport:{width:1920,height:1100}})
  const errors=[]
  const requested=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('request',r=>requested.push(r.url()))
  const response=await page.request.post('http://127.0.0.1:8000/api/v1/auth/login',{data:{username:process.env.EMS_VERIFY_USER||'docente',password:process.env.EMS_VERIFY_PASSWORD||'teacher-change-me'}})
  assert.ok(response.ok());const auth=await response.json()
  await page.context().addCookies([
    {name:'thisisjustarandomstring',value:JSON.stringify(auth.access_token),url:'http://127.0.0.1:5173'},
    {name:'ems-user',value:JSON.stringify(auth.user),url:'http://127.0.0.1:5173'},
  ])
  await page.goto('http://127.0.0.1:5173/')
  const global=page.getByRole('combobox',{name:'Escenario global'})
  await global.waitFor()
  await global.click();await page.getByRole('option',{name:'4G EPC',exact:true}).click()
  for(const [path,api] of [
    ['/','/scenarios/4g-epc/status'],['/topology','/scenarios/4g-epc/status'],
    ['/commands','/operations/catalog/4g-epc'],['/alarms','/alarm-center/4g-epc'],
    ['/configuration','/config/catalog/4g-epc'],['/performance','/performance/catalog/4g-epc'],
    ['/traces','/traces/capabilities/4g-epc'],
  ]) {
    requested.length=0
    await page.goto('http://127.0.0.1:5173'+path)
    await page.locator('main').waitFor()
    assert.match(await global.innerText(),/4G EPC/)
    await page.waitForTimeout(150)
    assert.ok(requested.some(url=>url.includes(api)),path+' uses global scenario')
    assert.equal(await page.locator('main h1').getAttribute('class'),'sr-only')
    assert.equal(await page.locator('main').getByRole('combobox',{name:/Escenario/}).count(),0)
    if(path==='/traces') assert.ok(await page.getByRole('tab',{name:'Subscriber Trace',exact:true}).isDisabled())
    if(path==='/topology') assert.equal(await page.locator('[data-slot="card"]').getByRole('tab',{name:'Telco',exact:true}).count(),1)
    if(path==='/commands') {
      await page.locator('[data-slot="card"]').getByRole('button',{name:'Manual',exact:true}).click()
      await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape')
      assert.ok(!(await page.locator('main').innerText()).includes('REMOTE'))
    }
  }
  await global.click();await page.getByRole('option',{name:'5G Standalone',exact:true}).click()
  await page.getByRole('heading',{name:'Centro de trazas',exact:true}).waitFor()
  assert.match(await global.innerText(),/5G Standalone/)
  await page.goto('http://127.0.0.1:5173/performance')
  await page.locator('main').waitFor()
  await page.screenshot({path:'../reportes/escenario-global-performance.png',fullPage:true})
  for(const width of [1280,768,390]){
    await page.setViewportSize({width,height:1000})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No overflow '+width)
    assert.ok(await global.isVisible())
  }
  assert.deepEqual(errors,[])
  console.log('PASS: persistent global scenario across seven views, no repeated headings/selectors, embedded topology/manual controls, 4G subscriber trace disabled, responsive layout. No core writes.')
}finally{await browser.close()}
