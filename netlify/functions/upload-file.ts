import { Handler } from '@netlify/functions'
import busboy from 'busboy'
import { supabase, getUserRole, errorResponse } from './_shared/handler'
import { Logger } from '../../lib/logger'
import { SITE_URL } from '../../lib/siteConfig'

const ALLOWED_ORIGINS = [
  SITE_URL,
  'http://localhost:3000',
  'http://localhost:8888',
  'http://localhost:9000',
].filter(Boolean) as string[]

export const handler: Handler = async (event): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  const logger = Logger.fromEvent('upload-file', event)
  const origin = event.headers.origin || event.headers.Origin

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse({ code: 'method_not_allowed', headers })
  }

  // Verify authentication — any logged-in user can upload
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse({ code: 'unauthorized', headers })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !authUser) {
    return errorResponse({ code: 'unauthorized', headers })
  }

  const userRole = getUserRole(authUser)
  const userEmail = authUser.email || 'unknown'
  const isPrivileged = userRole === 'admin' || userRole === 'executive'

  return new Promise((resolve) => {
    let bb: ReturnType<typeof busboy>
    try {
      bb = busboy({
        headers: { 'content-type': event.headers['content-type'] || '' }
      })
    } catch (err) {
      logger.warn('file', 'busboy_ctor_error', 'Unsupported content type', {
        metadata: {
          contentType: event.headers['content-type'] || '',
          error: err instanceof Error ? err.message : String(err),
        },
      })
      resolve({
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Unsupported Content-Type; expected multipart/form-data' }),
      })
      return
    }

    let fileName = ''
    let filePath = ''
    let fileBuffer: Buffer[] = []
    let fileSize = 0
    let originalFileName = ''
    // When the size limit is hit, busboy still emits 'finish' — without
    // this guard the partial buffer was uploaded anyway, leaving an
    // ~10MB orphan file in storage even though the client got a 413.
    let rejected = false

    bb.on('file', (name, file, info) => {
      const { filename, mimeType } = info
      originalFileName = filename
      logger.info('file', 'file_receiving', `Receiving file: ${filename}`, {
        metadata: { filename, mimeType }
      })

      // Validate that the declared MIME type is consistent with the
      // filename's extension for the common types we care about.
      // Header-vs-extension matching only — strong magic-byte sniffing is
      // overkill here; this catches the easy mislabels.
      const ext = filename.split('.').pop()?.toLowerCase() || ''
      const EXT_MIME: Record<string, string[]> = {
        pdf: ['application/pdf'],
        png: ['image/png'],
        jpg: ['image/jpeg'],
        jpeg: ['image/jpeg'],
        gif: ['image/gif'],
        txt: ['text/plain'],
        xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        xls: ['application/vnd.ms-excel'],
        docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        doc: ['application/msword'],
        pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        ppt: ['application/vnd.ms-powerpoint'],
      }
      const allowedMimes = EXT_MIME[ext]
      if (allowedMimes && mimeType && !allowedMimes.includes(mimeType)) {
        rejected = true
        file.resume()
        logger.warn('file', 'file_mime_mismatch', `Extension/MIME mismatch: ${filename} (${mimeType})`, {
          metadata: { filename, mimeType, ext, allowedMimes },
        })
        resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: `Declared content type "${mimeType}" does not match file extension ".${ext}"`,
          }),
        })
        return
      }

      const timestamp = Date.now()
      // Strip non-allowed chars, then collapse runs of '.' to a single dot
      // and trim leading dots. Defense-in-depth: even if this filename is
      // ever joined into a path elsewhere, a '..' sequence cannot appear.
      const safeFilename = filename
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/\.{2,}/g, '.')
        .replace(/^\.+/, '')
      fileName = `${timestamp}-${safeFilename}`

      file.on('data', (data) => {
        if (rejected) return
        fileBuffer.push(data)
        fileSize += data.length

        if (fileSize > 10 * 1024 * 1024) {
          rejected = true
          file.destroy()
          logger.warn('file', 'file_too_large', `File too large: ${originalFileName}`, {
            metadata: { filename: originalFileName, size: fileSize }
          })
          resolve(errorResponse({
            code: 'invalid_input',
            statusCode: 413,
            headers,
            message: 'That file is too large — please upload a file under 10 MB.',
          }))
        }
      })

      file.on('end', () => {
        logger.info('file', 'file_received', `File received: ${fileName}`, {
          metadata: { filename: fileName, size: fileSize }
        })
      })
    })

    bb.on('field', (name, val) => {
      if (name === 'path') filePath = val
    })

    bb.on('finish', async () => {
      if (rejected) return
      if (!fileBuffer.length) {
        resolve(errorResponse({
          code: 'invalid_input',
          headers,
          message: 'No file was received. Please pick a file and try again.',
        }))
        return
      }

      try {
        const fullBuffer = Buffer.concat(fileBuffer)

        // Light magic-byte check for PDF: a real PDF starts with "%PDF-".
        // This catches the obvious .pdf-extension/EXE-bytes mislabel even
        // when both the extension and declared MIME claim PDF. We don't
        // sniff every type — full magic-byte detection is overkill — but
        // PDFs are the most common upload here so the cheap check pays.
        const fileExt = originalFileName.split('.').pop()?.toLowerCase() || ''
        if (fileExt === 'pdf') {
          const head = fullBuffer.slice(0, 5).toString('binary')
          if (head !== '%PDF-') {
            logger.warn('file', 'file_magic_mismatch', `PDF magic-byte mismatch: ${originalFileName}`, {
              metadata: { filename: originalFileName, head },
            })
            resolve({
              statusCode: 400,
              headers,
              body: JSON.stringify({ error: 'File contents do not match declared PDF type' }),
            })
            return
          }
        }

        const bucket = filePath && filePath.includes('email-images')
          ? 'email-images'
          : filePath && filePath.includes('newsletter')
          ? 'newsletters'
          : filePath && filePath.includes('training')
          ? 'training-materials'
          : 'portal-resources'

        // Privileged buckets are admin/executive only. portal-resources
        // is the catch-all for any authenticated user.
        if (bucket !== 'portal-resources' && !isPrivileged) {
          logger.warn('file', 'upload_forbidden', `Non-privileged user tried to upload to ${bucket}`, {
            metadata: { userEmail, role: userRole, bucket, filename: originalFileName }
          })
          resolve(errorResponse({
            code: 'forbidden',
            headers,
            message: 'You don’t have permission to upload to this location.',
          }))
          return
        }

        const getContentType = (filename: string) => {
          const ext = filename.split('.').pop()?.toLowerCase()
          const types: Record<string, string> = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          }
          return types[ext || ''] || 'application/octet-stream'
        }

        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(fileName, fullBuffer, {
            contentType: getContentType(originalFileName),
            cacheControl: '3600',
            upsert: false
          })

        if (error) {
          logger.error('file', 'upload_failed', `Upload failed: ${originalFileName}`, new Error(error.message), {
            metadata: { filename: originalFileName, bucket }
          })
          resolve(errorResponse({
            code: 'server_error',
            headers,
            message: 'We couldn’t save that file. Please try again in a moment.',
          }))
          return
        }

        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(data.path)

        await logger.audit('CREATE', 'file', data.path, {
          actorId: authUser.id,
          actorEmail: userEmail,
          newValues: { filename: fileName, bucket, size: fileSize, path: data.path },
          description: `Uploaded file: ${fileName} to ${bucket}`
        })

        logger.info('file', 'upload_success', `File uploaded: ${fileName}`, {
          metadata: { filename: fileName, bucket, size: fileSize, path: data.path }
        })

        resolve({
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            fileName,
            url: publicUrl,
            publicUrl,
            size: fileSize,
            bucket,
            path: data.path
          })
        })
      } catch (error) {
        logger.error('file', 'upload_error', 'Error uploading file', error instanceof Error ? error : new Error(String(error)), {
          metadata: { filename: originalFileName }
        })
        resolve(errorResponse({
          code: 'server_error',
          headers,
          message: 'We couldn’t save that file. Please try again in a moment.',
        }))
      }
    })

    bb.on('error', (error) => {
      logger.error('file', 'busboy_error', 'File parsing error', error instanceof Error ? error : new Error(String(error)))
      resolve(errorResponse({
        code: 'server_error',
        headers,
        message: 'We couldn’t save that file. Please try again in a moment.',
      }))
    })

    if (event.body) {
      const buffer = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : Buffer.from(event.body)
      bb.end(buffer)
    } else {
      resolve(errorResponse({
        code: 'invalid_input',
        headers,
        message: 'No file was received. Please pick a file and try again.',
      }))
    }
  })
}
