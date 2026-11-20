import { cp, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import type { Connect, Plugin } from 'vite'
import type { Client } from '@libsql/client'

function localAPI(env: NodeJS.ProcessEnv): Plugin {
  let db: Promise<Client> | undefined
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/dashboard') return next()
    try {
      const [{ dashboard }, { connectDatabase }, { migrate }] = await Promise.all([
        import('./server/handler.ts'), import('./server/store.ts'), import('./tools/migrate.ts'),
      ])
      db ??= (async () => {
        const client = connectDatabase(env)
        try {
          if (env.TURSO_DATABASE_URL?.startsWith('file:')) await migrate(client)
          return client
        } catch (error) {
          client.close()
          throw error
        }
      })().catch(error => { db = undefined; throw error })
      const client = await db
      const data: Buffer[] = []
      let bytes = 0
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 120_000) {
          res.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify({ ok: false, error: 'size' }))
          return
        }
        data.push(chunk)
      }
      const url = new URL(req.url, 'http://' + req.headers.host)
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      const request = new Request(url, { method: req.method, headers, body: data.length ? new Uint8Array(Buffer.concat(data)) : undefined })
      const response = await dashboard(request, () => client, env)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Local API error')
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ ok: false, error: 'server' }))
    }
  }
  return {
    name: 'dashboard-local-api',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}

function offlineShell(): Plugin {
  return {
    name: 'dashboard-offline-shell',
    apply: 'build',
    async closeBundle() {
      for (const dir of ['assets', 'fonts']) await cp(dir, resolve('dist', dir), { recursive: true })
      await cp('manifest.webmanifest', 'dist/manifest.webmanifest')
      const files = (await readdir('dist', { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile())
        .map(entry => resolve(entry.parentPath, entry.name).slice(resolve('dist').length))
        .sort()
      const version = createHash('sha256')
      for (const file of files) version.update(file).update(await readFile('dist' + file))
      const sw = await readFile('src/worker.js', 'utf8')
      await writeFile('dist/sw.js', sw.replace('__CACHE_VERSION__', version.digest('hex').slice(0, 16))
        .replace('/*PRECACHE*/ []', JSON.stringify(files.filter(file => file !== '/index.html').concat('/'))))
    },
  }
}

export default defineConfig(({ mode }) => ({
  envPrefix: 'DASHBOARD_PUBLIC_',
  plugins: [localAPI({ ...loadEnv(mode, process.cwd(), ''), ...process.env }), offlineShell()],
}))
