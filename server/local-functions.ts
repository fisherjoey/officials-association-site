// Local development server for Netlify Functions
// Run this instead of Netlify Dev when it's not working
import express from 'express'
import cors from 'cors'
import * as dotenv from 'dotenv'
import busboy from 'busboy'
import type { HandlerResponse } from '@netlify/functions'

// Load environment variables
dotenv.config({ path: '.env.local' })

const app = express()
const PORT = 8888

// Middleware
app.use(cors())
app.use(express.json())

// Import function handlers
async function loadFunctions() {
  const { handler: resourcesHandler } = await import('../netlify/functions/resources.js')
  const { handler: calendarEventsHandler } = await import('../netlify/functions/calendar-events.js')
  const { handler: announcementsHandler } = await import('../netlify/functions/announcements.js')
  const { handler: uploadFileHandler } = await import('../netlify/functions/upload-file.js')
  const { handler: listResourceFilesHandler } = await import('../netlify/functions/list-resource-files.js')

  // Helper to convert Express req to Netlify event
  const createEvent = (req: express.Request) => ({
    httpMethod: req.method,
    headers: req.headers as Record<string, string>,
    body: req.body ? JSON.stringify(req.body) : null,
    queryStringParameters: req.query as Record<string, string>,
    path: req.path,
    isBase64Encoded: false
  })

  const mockContext = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'local-function',
    functionVersion: '1',
    invokedFunctionArn: '',
    memoryLimitInMB: '1024',
    awsRequestId: 'local-request',
    logGroupName: '',
    logStreamName: '',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {}
  }

  // Helper to send response
  const sendResponse = (res: express.Response, response: HandlerResponse | void) => {
    if (!response) {
      res.status(500).json({ error: 'No response from handler' })
      return
    }
    res.status(response.statusCode).set(response.headers).send(response.body)
  }

  // Resources endpoint
  app.all('/.netlify/functions/resources', async (req, res) => {
    try {
      const event = createEvent(req)
      const response = await resourcesHandler(event as any, mockContext as any)
      sendResponse(res, response)
    } catch (error) {
      console.error('Resources error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Calendar events endpoint
  app.all('/.netlify/functions/calendar-events', async (req, res) => {
    try {
      const event = createEvent(req)
      const response = await calendarEventsHandler(event as any, mockContext as any)
      sendResponse(res, response)
    } catch (error) {
      console.error('Calendar events error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Announcements endpoint
  app.all('/.netlify/functions/announcements', async (req, res) => {
    try {
      const event = createEvent(req)
      const response = await announcementsHandler(event as any, mockContext as any)
      sendResponse(res, response)
    } catch (error) {
      console.error('Announcements error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Upload file endpoint (special handling for multipart/form-data)
  app.post('/.netlify/functions/upload-file', (req, res) => {
    const bb = busboy({ headers: req.headers })
    let fileBuffer: Buffer
    let fileName: string
    let filePath: string

    bb.on('file', (name: string, file: NodeJS.ReadableStream, info: busboy.FileInfo) => {
      fileName = info.filename
      const chunks: Buffer[] = []
      file.on('data', (data: Buffer) => chunks.push(data))
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks)
      })
    })

    bb.on('field', (name: string, val: string) => {
      if (name === 'path') filePath = val
    })

    bb.on('finish', async () => {
      try {
        const event = {
          httpMethod: 'POST',
          headers: req.headers as Record<string, string>,
          body: fileBuffer.toString('base64'),
          queryStringParameters: {},
          path: req.path,
          isBase64Encoded: true
        }
        const response = await uploadFileHandler(event as any, mockContext as any)
        sendResponse(res, response)
      } catch (error) {
        console.error('Upload error:', error)
        res.status(500).json({ error: 'Upload failed' })
      }
    })

    req.pipe(bb)
  })

  // List resource files endpoint
  app.get('/.netlify/functions/list-resource-files', async (req, res) => {
    try {
      const event = createEvent(req)
      const response = await listResourceFilesHandler(event as any, mockContext as any)
      sendResponse(res, response)
    } catch (error) {
      console.error('List files error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Local functions server running' })
  })

  app.listen(PORT, () => {
    console.log(`\n🚀 Local Functions Server running on http://localhost:${PORT}`)
    console.log(`📝 Available endpoints:`)
    console.log(`   - http://localhost:${PORT}/.netlify/functions/resources`)
    console.log(`   - http://localhost:${PORT}/.netlify/functions/calendar-events`)
    console.log(`   - http://localhost:${PORT}/.netlify/functions/announcements`)
    console.log(`   - http://localhost:${PORT}/.netlify/functions/upload-file`)
    console.log(`   - http://localhost:${PORT}/.netlify/functions/list-resource-files`)
    console.log(`\n✨ Ready for testing!\n`)
  })
}

loadFunctions().catch(console.error)
