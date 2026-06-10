import fg from 'fast-glob'
import fs from 'fs-extra'
import matter from 'gray-matter'

const DOMAIN = 'https://eanil.dev'

async function buildSitemap() {
  const mdFiles = await fg('pages/**/*.md')

  const staticRoutes = ['/', '/about', '/projects', '/posts']

  const postRoutes = mdFiles
    .filter(f => f.startsWith('pages/posts/') && !f.includes('index'))
    .map((f) => {
      const { data } = matter(fs.readFileSync(f, 'utf-8'))
      if (data.draft)
        return null
      return f.replace(/^pages(.+)\.md$/, '$1')
    })
    .filter(Boolean) as string[]

  const allRoutes = [...staticRoutes, ...postRoutes]

  const urls = allRoutes
    .map(route => `  <url>\n    <loc>${DOMAIN}${route}</loc>\n  </url>`)
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  await fs.ensureDir('./dist')
  await fs.writeFile('./dist/sitemap.xml', xml, 'utf-8')
  console.log(`Sitemap generated with ${allRoutes.length} URLs`)
}

buildSitemap()
