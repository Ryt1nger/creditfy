import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const errs = []; const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()))
p.on('response', r => r.status() >= 400 && r.url().includes('/api/') && errs.push(r.status() + ' ' + r.url()))
const B = 'http://127.0.0.1:5174/#/'
await p.goto(B); await p.waitForSelector('.acc'); await p.click('text=Иван Соколов'); await p.waitForSelector('.app-card')
console.log('client cards:', await p.locator('.app-card').count())
// мастер заявки на живом API
await p.goto(B + 'apply'); await p.waitForSelector('.wiz')
await p.click('text=Продолжить'); await p.click('text=Продолжить')
await p.click('text=Север-Логистика >> nth=0'); await p.waitForSelector('.card.soft h3'); await p.click('text=Продолжить')
const nums = ['60000000', '9000000', '5000000', '150000']
const inputs = p.locator('.suffix input'); for (let i = 0; i < 4; i++) await inputs.nth(i).fill(nums[i])
await p.fill('input[placeholder="Иван Соколов"]', 'Иван Соколов'); await p.fill('input[placeholder="+7 900 000-00-00"]', '+7 900 111-22-33')
await p.click('text=Продолжить'); await p.waitForSelector('text=Документы и отправка')
while (await p.locator('button:has-text("Образец")').count()) { await p.locator('button:has-text("Образец")').first().click(); await p.waitForTimeout(400) }
await p.check('input[type=checkbox]'); await p.click('text=Отправить заявку'); await p.waitForSelector('.status-hero')
await p.waitForSelector('text=Банк одобрил', { timeout: 15000 })
console.log('offer reached:', await p.locator('.offer-card').count())
await p.click('text=Принять условия'); await p.waitForSelector('text=Подписать и получить деньги'); await p.check('input[type=checkbox]'); await p.click('text=Подписать и получить деньги')
await p.waitForSelector('text=Кредит выдан', { timeout: 8000 }); console.log('disbursed, schedule rows:', await p.locator('.table tbody tr').count())
await p.screenshot({ path: 'live-disbursed.png', fullPage: false })
// банк
await p.click('.userchip'); await p.waitForSelector('.acc'); await p.click('text=Дмитрий Орлов'); await p.waitForSelector('tr.click')
await p.click('tr.click >> nth=0'); await p.waitForSelector('.gauge'); console.log('bank review ok')
console.log('ERRORS', JSON.stringify(errs)); await b.close()
