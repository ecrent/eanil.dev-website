import fg from 'fast-glob'
import fs from 'fs-extra'
import matter from 'gray-matter'

const DOMAIN = 'https://eanil.dev'

function injectTag(html: string, tag: string): string {
  return html.replace('</head>', `${tag}\n</head>`)
}

async function run() {
  // Inject canonical URLs into all HTML files in dist
  const allHtmlFiles = await fg('./dist/**/index.html')
  for (const file of allHtmlFiles) {
    const urlPath = file
      .replace('./dist', '')
      .replace(/\/index\.html$/, '') || '/'
    const canonical = `<link rel="canonical" href="${DOMAIN}${urlPath}" />`
    const html = await fs.readFile(file, 'utf-8')
    await fs.writeFile(file, injectTag(html, canonical), 'utf-8')
  }
  console.log(`Injected canonical URLs into ${allHtmlFiles.length} pages`)

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
  const jsonLdTag = `<script type="application/ld+json">${JSON.stringify(personSchema)}</script>`
  await fs.writeFile('./dist/index.html', injectTag(indexHtml, jsonLdTag), 'utf-8')
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

    const route = slug.split('/').pop()!
    const ogImage = data.image?.startsWith('/')
      ? `${DOMAIN}${data.image}`
      : data.image || `${DOMAIN}/og/${route}.png`

    const blogSchema = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      'headline': data.title,
      'datePublished': data.date,
      'description': data.description || '',
      'image': ogImage,
      'url': `${DOMAIN}${slug}`,
      'author': {
        '@type': 'Person',
        'name': 'Anil Talasli',
        'url': DOMAIN,
      },
    }

    const postHtml = await fs.readFile(outPath, 'utf-8')
    const blogTag = `<script type="application/ld+json">${JSON.stringify(blogSchema)}</script>`
    await fs.writeFile(outPath, injectTag(postHtml, blogTag), 'utf-8')
    console.log(`Injected BlogPosting schema into ${outPath}`)
  }
}

run()
