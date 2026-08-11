/**
 * Smoke tests for the four public read endpoints. They're thin wrappers
 * over Supabase SELECTs — we just want to confirm each one is reachable,
 * unauthenticated, and shaped the way the public site expects.
 */
import { handler as newsHandler } from '@/netlify/functions/public-news'
import { handler as pagesHandler } from '@/netlify/functions/public-pages'
import { handler as resourcesHandler } from '@/netlify/functions/public-resources'
import { handler as trainingHandler } from '@/netlify/functions/public-training'
import { invokeFunction } from './helpers/invokeFunction'

describe('public read endpoints', () => {
  it('public-news GET returns an array', async () => {
    const res = await invokeFunction<any[]>(newsHandler, { method: 'GET' })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('public-news rejects writes without auth', async () => {
    const res = await invokeFunction(newsHandler, { method: 'POST', body: { title: 'x' } })
    expect([401, 403]).toContain(res.statusCode)
  })

  it('public-pages GET returns an array', async () => {
    const res = await invokeFunction<any[]>(pagesHandler, { method: 'GET' })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('public-pages rejects writes without auth', async () => {
    const res = await invokeFunction(pagesHandler, { method: 'POST', body: { page_name: 'x' } })
    expect([401, 403]).toContain(res.statusCode)
  })

  it('public-resources GET returns an array', async () => {
    const res = await invokeFunction<any[]>(resourcesHandler, { method: 'GET' })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('public-resources rejects writes without auth', async () => {
    const res = await invokeFunction(resourcesHandler, { method: 'POST', body: { title: 'x' } })
    expect([401, 403]).toContain(res.statusCode)
  })

  it('public-training GET responds 200', async () => {
    const res = await invokeFunction(trainingHandler, { method: 'GET' })
    expect(res.statusCode).toBe(200)
  })
})
