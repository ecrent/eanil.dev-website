import fg from 'fast-glob'
import fs from 'fs-extra'
import matter from 'gray-matter'

const DOMAIN = 'https://eanil.dev'

function injectScript(html: string, json: object): string {
  const tag = `<script type="application/ld+json">${JSON.stringify(json)}</script>`
  return html.replace('</head>', `${tag}\n</head>`)
}

async function run() {
  // Person schema on homepage
  const indexHtml = await fs.readFile('./dist/index.html', 'utf-8')
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    'name': 'Anil Talasli',
    'url': DOMAIN,
    'email': 'hi@eanil.dev',
    'jobTitle': 'Software Developer',
    'sameAs': [`${DOMAIN}/about`, 'https://github.com/ecrent'],
  }
  await fs.writeFile('./dist/index.html', injectScript(indexHtml, personSchema), 'utf-8')
  console.log('Injected Person schema into index.html')

  // BlogPosting schema on each post
  const postFiles = await fg('pages/posts/*.md')
  for (const file of postFiles) {
    if (file.includes('index'))
      continue
    const { data } = matter(await fs.readFile(file, 'utf-8'))
    const slug = file.replace(/^pages(.+)\.md$/, '$1')
    const outPath = `./dist${slug}/index.html`
    if (!await fs.pathExists(outPath))
      continue

    const blogSchema = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      'headline': data.title,
      'datePublished': data.date,
      'description': data.description || '',
      'image': data.image || `${DOMAIN}/eanil-icon-192.png`,
      'url': `${DOMAIN}${slug}`,
      'author': {
        '@type': 'Person',
        'name': 'Anil Talasli',
        'url': DOMAIN,
      },
    }

    const html = await fs.readFile(outPath, 'utf-8')
    await fs.writeFile(outPath, injectScript(html, blogSchema), 'utf-8')
    console.log(`Injected BlogPosting schema into ${outPath}`)
  }
}

run()
