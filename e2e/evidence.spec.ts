import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const evidenceDirectory = process.env.EVIDENCE_OUTPUT_DIR
  ? resolve(process.env.EVIDENCE_OUTPUT_DIR)
  : join(process.cwd(), 'evidence', 'screenshots')
mkdirSync(evidenceDirectory, { recursive: true })

async function chooseLanguage(page: Page, language = 'English') {
  const dialog = page.getByRole('dialog', { name: 'Choose website language' })
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole('button', { name: language }).click()
  }
}

async function capture(page: Page, route: string, name: string) {
  await page.goto(route)
  await chooseLanguage(page)
  await page.locator('.public-site, .app-shell, .not-found').first().waitFor({ state: 'visible' })
  if (route.startsWith('/admin')) {
    await expect(page.locator('.content h1').first()).toBeVisible()
    await expect(page.getByText('Loading admin page...')).toHaveCount(0)
  }
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(evidenceDirectory, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('evidence-storage-reset')) return
    localStorage.clear()
    sessionStorage.setItem('evidence-storage-reset', 'true')
  })
})

test('capture every public route screen', async ({ page }) => {
  await page.goto('/?host=lassanipolyclinic.com')
  await expect(page.getByRole('dialog', { name: 'Choose website language' })).toBeVisible()
  await page.screenshot({
    path: join(evidenceDirectory, 'public-language-choice.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await chooseLanguage(page, 'English')

  const routes = [
    ['/?host=indushospital.com', 'public-directory-indus'],
    ['/lhr/01?host=indushospital.com', 'public-directory-branch'],
    ['/clinic/indus-health', 'public-directory-organization-route'],
    ['/?host=lassanipolyclinic.com', 'public-directory-lasaani'],
    ['/khi/01/doctors/prac_a1?host=indushospital.com', 'public-doctor-indus'],
    ['/doctors/prac_h1?host=lassanipolyclinic.com', 'public-doctor-lasaani'],
    ['/clinic/indus-health/doctors/prac_a1', 'public-doctor-organization-route'],
  ] as const

  for (const [route, name] of routes) await capture(page, route, name)

  await page.goto('/?host=lassanipolyclinic.com')
  await page.getByRole('button', { name: 'English / اردو' }).click()
  await page.getByRole('dialog', { name: 'Choose website language' }).getByRole('button', { name: 'اردو' }).click()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(evidenceDirectory, 'public-directory-lasaani-urdu.png'),
    fullPage: true,
    animations: 'disabled',
  })
})

test('capture every admin route screen', async ({ page }) => {
  const routes = [
    ['/login', 'admin-login-membership-picker'],
    ['/admin', 'admin-dashboard'],
    ['/admin/practitioners', 'admin-practitioners'],
    ['/admin/patients', 'admin-patients'],
    ['/admin/appointments', 'admin-appointment-requests'],
    ['/admin/settings', 'admin-organization-settings'],
    ['/admin/modules/general-medicine', 'admin-general-medicine-module'],
    ['/admin/modules/gynecology', 'admin-gynecology-module'],
    ['/admin/modules/dentistry', 'admin-dentistry-module'],
    ['/not-found', 'not-found'],
  ] as const

  for (const [route, name] of routes) await capture(page, route, name)

  await page.goto('/admin/practitioners')
  await page.getByRole('button', { name: 'Set days and hours' }).click()
  await expect(page.getByRole('dialog', { name: 'Public availability' })).toBeVisible()
  await page.screenshot({
    path: join(evidenceDirectory, 'admin-availability-dialog.png'),
    fullPage: true,
    animations: 'disabled',
  })

  await page.goto('/admin/settings')
  await page.getByLabel('Clinic name').fill('Evidence Branch Clinic')
  await page.getByLabel('City', { exact: true }).fill('Lahore')
  await page.getByLabel('City code', { exact: true }).fill('lhr')
  await page.getByLabel('Branch code', { exact: true }).fill('98')
  await page.getByLabel('Public slug', { exact: true }).fill('evidence-branch')
  await page.getByLabel('Timezone', { exact: true }).fill('Asia/Karachi')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(evidenceDirectory, 'admin-add-clinic-form.png'),
    fullPage: true,
    animations: 'disabled',
  })

  await page.goto('/admin')
  await page.getByLabel('Clinic').selectOption('clinic_aurora_east')
  await expect(page.getByLabel('Clinic')).toHaveValue('clinic_aurora_east')
  await capture(page, '/admin/modules/cardiology', 'admin-cardiology-module')

  await page.goto('/admin')
  await page.getByLabel('Organization').selectOption('org_harbor')
  await expect(page.getByLabel('Organization')).toHaveValue('org_harbor')
  await capture(page, '/admin/modules/pediatrics', 'admin-pediatrics-module')

  await page.goto('/admin/practitioners')
  await page.getByLabel('Full name').fill('Evidence Photo Doctor')
  await page.getByLabel('Email').fill('evidence-photo@example.com')
  await page.getByLabel('Phone').fill('+92 300 000 0088')
  await page.getByLabel('Or upload a photo (1 MB max)').setInputFiles({
    name: 'evidence-doctor.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#0f5c4c"/><circle cx="60" cy="42" r="23" fill="#d7ebe4"/><path d="M20 120c3-29 18-43 40-43s37 14 40 43" fill="#d7ebe4"/></svg>',
    ),
  })
  await page.getByRole('checkbox', { name: 'General Medicine' }).check()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(evidenceDirectory, 'admin-practitioner-photo-upload.png'),
    fullPage: true,
    animations: 'disabled',
  })
})

test('capture appointment and mobile interaction states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?host=indushospital.com')
  await chooseLanguage(page)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(evidenceDirectory, 'public-directory-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })

  await page.goto('/khi/01/doctors/prac_a1?host=indushospital.com')
  await chooseLanguage(page)
  await page.getByRole('button', { name: 'Request an appointment' }).click()
  await page.getByLabel('Your name').fill('Evidence Patient')
  await page.getByLabel('Phone').fill('+92 300 000 0000')
  await page.getByLabel('Email').fill('evidence-patient@example.com')
  await page.getByLabel('Message').fill('Evidence capture appointment request')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText('Request sent to the clinic.')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(evidenceDirectory, 'public-appointment-request-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })

  await page.setViewportSize({ width: 1365, height: 950 })
  await page.goto('/admin/appointments')
  await expect(page.getByText('Evidence Patient')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(evidenceDirectory, 'admin-appointment-inbox-populated.png'),
    fullPage: true,
    animations: 'disabled',
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/patients')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(evidenceDirectory, 'admin-patients-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
})
