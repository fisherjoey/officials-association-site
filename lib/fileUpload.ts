import { validators, AppError } from './errorHandling'
import { getSupabaseBrowserClient } from './api/client'
import { isPublicBucket, toStorageRef } from './storageRefs'

const MAX_FILE_SIZE_MB = 25
const ALLOWED_FILE_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'mp4', 'avi', 'mov', 'jpg', 'jpeg', 'png']

function getContentType(filename: string): string {
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
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime'
  }
  return types[ext || ''] || 'application/octet-stream'
}

export interface UploadedFile {
  /**
   * What the row should store. For a private bucket that is a
   * `storage://<bucket>/<path>` reference, not a URL — see `lib/fileDownload.ts`
   * for why, and use `resolveFileUrl()` or `<FileDownloadLink>` to turn it back
   * into something fetchable. For the public bucket it is the public URL,
   * because that link has to keep working for people with no session.
   */
  fileRef: string
  bucket: string
  /** Object key inside the bucket. */
  path: string
  fileName: string
  size: number
}

export async function uploadFile(file: File, path?: string): Promise<UploadedFile> {
  // Frontend validation before upload
  const fileSizeError = validators.fileSize(file, MAX_FILE_SIZE_MB)
  if (fileSizeError) {
    throw new AppError(fileSizeError, 'VALIDATION_ERROR')
  }

  const fileTypeError = validators.fileType(file, ALLOWED_FILE_TYPES)
  if (fileTypeError) {
    throw new AppError(fileTypeError, 'VALIDATION_ERROR')
  }

  // Check for potentially dangerous file names
  const originalFileName = file.name
  if (originalFileName.includes('..') || originalFileName.includes('/') || originalFileName.includes('\\')) {
    throw new AppError('Invalid file name. File names cannot contain path separators.', 'VALIDATION_ERROR')
  }

  // Generate safe filename with timestamp
  const timestamp = Date.now()
  const safeFilename = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const fileName = `${timestamp}-${safeFilename}`

  // Determine bucket based on path
  const bucket = path && path.includes('email-images')
    ? 'email-images'
    : path && path.includes('newsletter')
    ? 'newsletters'
    : path && path.includes('training')
    ? 'training-materials'
    : path && path.includes('evaluation')
    ? 'evaluations'
    : 'portal-resources'

  try {
    // Use direct Supabase upload (bypasses Netlify function size limits)
    const supabase = getSupabaseBrowserClient()

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        contentType: getContentType(originalFileName),
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Supabase upload error:', error)
      throw new AppError(`Upload failed: ${error.message}`, 'UPLOAD_ERROR')
    }

    // Persist where the object lives, not a link to it. `/object/public/…`
    // only resolves for a public bucket, and a signed link would be stale
    // long before anyone clicked it; both are minted on read instead.
    const fileRef = isPublicBucket(bucket)
      ? supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl
      : toStorageRef(bucket, data.path)

    return {
      fileRef,
      bucket,
      path: data.path,
      fileName,
      size: file.size
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    // Handle network errors
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new AppError(
        'Network error during file upload. Please check your connection and try again.',
        'NETWORK_ERROR'
      )
    }

    throw new AppError(
      error instanceof Error ? error.message : 'File upload failed',
      'UPLOAD_ERROR'
    )
  }
}
