import { getSupabaseBrowserClient } from '../api/client'
import { StorageAdapter, FileUploadResult, StorageFile } from './interface'

const supabase = getSupabaseBrowserClient()

export class SupabaseStorageAdapter implements StorageAdapter {
  private bucket: string

  constructor(bucket: string = 'portal-resources') {
    this.bucket = bucket
  }

  async uploadFile(file: File, path: string = ''): Promise<FileUploadResult> {
    try {
      // Generate unique filename
      const timestamp = Date.now()
      const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const fileName = `${timestamp}-${safeFilename}`
      const fullPath = path ? `${path}/${fileName}` : fileName

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.bucket)
        .upload(fullPath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Supabase upload error:', error)
        throw new Error(`Upload failed: ${error.message}`)
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(this.bucket)
        .getPublicUrl(data.path)

      // Save metadata to database (resources table)
      const { error: dbError } = await supabase
        .from('resources')
        .insert({
          file_name: fileName,
          original_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
          mime_type: file.type,
          bucket: this.bucket,
          path: data.path
        })

      if (dbError) {
        console.warn('Failed to save metadata:', dbError)
        // Don't fail the upload if metadata save fails
      }

      return {
        url: publicUrl,
        publicUrl,
        fileName,
        size: file.size
      }
    } catch (error) {
      console.error('Upload error:', error)
      throw error instanceof Error ? error : new Error('Upload failed')
    }
  }

  async deleteFile(fileName: string, path: string = ''): Promise<boolean> {
    try {
      const fullPath = path ? `${path}/${fileName}` : fileName
      
      const { error } = await supabase.storage
        .from(this.bucket)
        .remove([fullPath])

      if (error) {
        console.error('Delete error:', error)
        return false
      }

      // Also delete from database
      await supabase
        .from('resources')
        .delete()
        .eq('file_name', fileName)

      return true
    } catch (error) {
      console.error('Delete error:', error)
      return false
    }
  }

  async listFiles(path: string = ''): Promise<StorageFile[]> {
    try {
      // First try to get from database (has metadata)
      const { data: dbFiles, error: dbError } = await supabase
        .from('resources')
        .select('*')
        .eq('bucket', this.bucket)
        .order('created_at', { ascending: false })

      if (!dbError && dbFiles && dbFiles.length > 0) {
        return dbFiles.map((file: any) => ({
          id: file.id,
          fileName: file.file_name,
          originalName: file.original_name || file.file_name,
          size: file.file_size || 0,
          type: file.mime_type || 'application/octet-stream',
          url: file.file_url,
          publicUrl: file.file_url,
          uploadedAt: file.created_at,
          uploadedBy: file.uploaded_by
        }))
      }

      // Fallback to storage list
      const { data, error } = await supabase.storage
        .from(this.bucket)
        .list(path, {
          limit: 100,
          offset: 0
        })

      if (error) {
        console.error('List error:', error)
        return []
      }

      if (!data) return []

      // Map storage files to our format
      return data.map((file: any) => {
        const { data: { publicUrl } } = supabase.storage
          .from(this.bucket)
          .getPublicUrl(`${path}/${file.name}`)

        return {
          fileName: file.name,
          originalName: file.name,
          size: file.metadata?.size || 0,
          type: file.metadata?.mimetype || 'application/octet-stream',
          url: publicUrl,
          publicUrl,
          uploadedAt: file.created_at || new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('List files error:', error)
      return []
    }
  }

  getFileUrl(fileName: string, path: string = ''): string {
    const fullPath = path ? `${path}/${fileName}` : fileName
    const { data: { publicUrl } } = supabase.storage
      .from(this.bucket)
      .getPublicUrl(fullPath)
    return publicUrl
  }

  // Helper method to create bucket if it doesn't exist
  async ensureBucket(): Promise<void> {
    try {
      const { data: buckets } = await supabase.storage.listBuckets()
      
      if (!buckets?.find((b: any) => b.name === this.bucket)) {
        const { error } = await supabase.storage.createBucket(this.bucket, {
          public: true,
          allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/gif',
            'video/mp4'
          ],
          fileSizeLimit: 52428800 // 50MB
        })
        
        if (error) {
          console.warn('Failed to create bucket:', error)
        }
      }
    } catch (error) {
      console.warn('Bucket check failed:', error)
    }
  }
}

// Export singleton instances for different buckets
export const resourcesStorage = new SupabaseStorageAdapter('portal-resources')
export const newsletterStorage = new SupabaseStorageAdapter('newsletters')
export const trainingStorage = new SupabaseStorageAdapter('training-materials')