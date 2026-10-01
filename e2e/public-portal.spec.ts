import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

async function chooseLanguage(page: import('@playwright/test').Page, language = 'English') {
  const dialog = page.getByRole('dialog', { name: 'Choose website language' })
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole('button', { name: language }).click()
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('playwright-storage-reset')) return
    localStorage.clear()
    sessionStorage.setItem('playwright-storage-reset', 'true')
  })
})

test('asks for language once and remembers the Urdu public preference', async ({ page }) => {
  await page.goto('/?host=lassanipolyclinic.com')
  const dialog = page.getByRole('dialog', { name: 'Choose website language' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'اردو' }).click()
  await expect(page.getByRole('link', { name: 'ہمارے ڈاکٹرز' })).toBeVisible()
  await expect(page.locator('.public-site')).not.toHaveAttribute('dir')

  await page.reload()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'ہمارے ڈاکٹرز' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'English / اردو' })).toBeVisible()
})

test('searches the directory and filters doctors by selected clinic', async ({ page }) => {
  await page.goto('/?host=indushospital.com')
  await chooseLanguage(page)

  await page.getByLabel('Search doctors').fill('Dr. Arifa Imran')
  await expect(page.getByRole('heading', { name: 'Dr. Arifa Imran' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dr. Syed Imran Garderzi' })).toHaveCount(0)

  await page.getByLabel('Search doctors').clear()
  await page.getByLabel('Clinic').selectOption('clinic_aurora_east')
  await expect(page.getByRole('heading', { name: 'Dr. Syeda Zainab' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dr. Arifa Imran' })).toHaveCount(0)

  const availableToday = page.getByLabel('Available today')
  await availableToday.check()
  await expect(availableToday).toBeChecked()
})

test('doctor profile can submit appointment request and admin can update its status', async ({ page }) => {
  await page.goto('/khi/01/doctors/prac_a1?host=indushospital.com')
  await chooseLanguage(page)
  await page.getByRole('button', { name: 'Request an appointment' }).click()
  await page.getByLabel('Your name').fill('Playwright Patient')
  await page.getByLabel('Phone').fill('+92 300 000 0099')
  await page.getByLabel('Email').fill('playwright@example.com')
  await page.getByLabel('Message').fill('Browser automation request')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText('Request sent to the clinic.')).toBeVisible()

  await page.goto('/admin/appointments')
  await expect(page.getByText('Playwright Patient')).toBeVisible()
  await page.getByLabel('Status for Playwright Patient').selectOption('contacted')
  await expect(page.getByLabel('Status for Playwright Patient')).toHaveValue('contacted')
})

test('public directory has no serious or critical automated accessibility violations', async ({ page }) => {
  await page.goto('/?host=lassanipolyclinic.com')
  await chooseLanguage(page)
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const serious = accessibility.violations.filter((violation) =>
    ['critical', 'serious'].includes(violation.impact ?? ''),
  )
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
})

test('public directory desktop visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 950 })
  await page.goto('/?host=lassanipolyclinic.com')
  await chooseLanguage(page)
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('directory-desktop.png', { fullPage: true })
})

test('doctor profile mobile visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/khi/01/doctors/prac_a1?host=indushospital.com')
  await chooseLanguage(page)
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('doctor-profile-mobile.png', { fullPage: true })
})

test('admin can upload a doctor photo that appears on the public directory card', async ({ page }) => {
  await page.goto('/admin/practitioners')
  await page.getByLabel('Full name').fill('Dr. Uploaded Photo')
  await page.getByLabel('Email').fill('uploaded-photo@example.com')
  await page.getByLabel('Phone').fill('+92 300 000 0011')
  await page.getByLabel('Profile photo URL').fill('')
  await page.getByLabel('Or upload a photo (1 MB max)').setInputFiles({
    name: 'doctor.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p1sAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.getByAltText('Profile photo preview')).toBeVisible()
  await page.getByRole('checkbox', { name: 'General Medicine' }).check()
  await page.getByRole('button', { name: 'Add doctor' }).click()
  await expect(page.getByText('Dr. Uploaded Photo')).toBeVisible()

  await page.goto('/?host=indushospital.com')
  await chooseLanguage(page)
  await page.getByLabel('Search doctors').fill('Dr. Uploaded Photo')
  await expect(page.getByAltText('Dr. Uploaded Photo profile')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  )
})
