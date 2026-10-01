import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = process.env.SNM_PREVIEW_URL || 'http://127.0.0.1:4444'
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
})

const results = {}

async function inspect(name, viewport, path) {
  const page = await browser.newPage({ viewport })
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByText('ws04.lab204.example.org').waitFor()
  await page.screenshot({ path, fullPage: true })

  results[name] = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    headings: [...document.querySelectorAll('h1, h2')].map((node) =>
      node.textContent?.trim(),
    ),
    visibleRows: document.querySelectorAll('.host-row').length,
    hostIconCenterOffset: (() => {
      const box = document
        .querySelector('.device-icon')
        ?.getBoundingClientRect()
      const icon = document
        .querySelector('.device-icon svg')
        ?.getBoundingClientRect()
      if (!box || !icon) return null
      return {
        x: Math.abs(box.x + box.width / 2 - (icon.x + icon.width / 2)),
        y: Math.abs(box.y + box.height / 2 - (icon.y + icon.height / 2)),
      }
    })(),
  }))
  assert.deepEqual(runtimeErrors, [], `${name} runtime errors`)
  assert.ok(
    results[name].documentWidth <= results[name].viewportWidth,
    `${name} document overflows`,
  )
  assert.ok(results[name].visibleRows > 0 && results[name].visibleRows <= 100)
  results[name].runtimeErrors = runtimeErrors
  await page.close()
}

await inspect(
  'desktop',
  { width: 1440, height: 1000 },
  '/tmp/snm-dashboard-desktop.png',
)
await inspect(
  'mobile',
  { width: 390, height: 844 },
  '/tmp/snm-dashboard-mobile.png',
)

const drawerPage = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
})
await drawerPage.goto(baseUrl, { waitUntil: 'networkidle' })
await drawerPage.getByText('ws04.lab204.example.org').first().click()
await drawerPage
  .getByRole('heading', { name: 'ws04.lab204.example.org' })
  .waitFor()
await drawerPage.screenshot({
  path: '/tmp/snm-dashboard-drawer.png',
  fullPage: true,
})
results.drawer = {
  title: await drawerPage
    .getByRole('heading', { name: 'ws04.lab204.example.org' })
    .textContent(),
  historyEvents: await drawerPage.locator('.timeline li').count(),
}
await drawerPage.close()

const skipRoomsPage = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
})
await skipRoomsPage.goto(baseUrl, { waitUntil: 'networkidle' })
await skipRoomsPage.getByRole('button', { name: 'Skip rooms' }).click()
await skipRoomsPage.locator('.skip-room-row').first().waitFor()
await skipRoomsPage.screenshot({
  path: '/tmp/snm-dashboard-skip-rooms.png',
  fullPage: true,
})
results.skipRooms = {
  choices: await skipRoomsPage.locator('.skip-room-row').count(),
  selected: await skipRoomsPage.locator('.skip-room-row input:checked').count(),
}
await skipRoomsPage.close()

await browser.close()
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
