import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(process.cwd(), 'dist')
const template = readFileSync(join(dist, 'index.html'), 'utf8')
const origin = (process.env.VITE_PUBLIC_SITE_ORIGIN || 'https://clinic-hub.example').replace(/\/$/, '')

const routes = [
  {
    path: '/',
    title: 'Clinic Hub | Find a doctor',
    description: 'Find doctors, specialties, and clinic contact details with Clinic Hub.',
  },
  {
    path: '/clinic/indus-health',
    title: 'Indus Hospital & Health Network | Find a doctor',
    description: 'Find doctors and specialties at Indus Hospital & Health Network.',
  },
  {
    path: '/lhr/01',
    title: 'Indus Gulberg Clinic | Find a doctor',
    description: 'Find doctors and contact details for Indus Gulberg Clinic.',
  },
  {
    path: '/clinic/lasaani-poly-clinic',
    title: 'Lasaani Poly Clinic | Find a doctor',
    description: 'Find doctors and specialties at Lasaani Poly Clinic.',
  },
]

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function renderPage(route) {
  const title = escapeHtml(route.title)
  const description = escapeHtml(route.description)
  const canonical = `${origin}${route.path}`
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/>/,
      `<meta name="description" content="${description}" />`,
    )
    .replace('</head>', `    <link rel="canonical" href="${canonical}" />\n  </head>`)
}

for (const route of routes) {
  const directory = join(dist, route.path)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'index.html'), renderPage(route))
}

const sitemap = routes
  .map(
    (route) =>
      `  <url><loc>${origin}${route.path}</loc></url>`,
  )
  .join('\n')
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap}\n</urlset>\n`,
)
writeFileSync(
  join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
)
