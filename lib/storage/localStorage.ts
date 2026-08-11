import { StorageAdapter, FileUploadResult, StorageFile } from './interface'
import { STORAGE_PREFIX } from '../siteConfig'

// LocalStorage adapter for development/demo
export class LocalStorageAdapter implements StorageAdapter {
  private storageKey: string

  constructor(storageKey: string = `${STORAGE_PREFIX}files`) {
    this.storageKey = storageKey
  }

  async uploadFile(file: File, path: string = ''): Promise<FileUploadResult> {
    // Check file size limit (2MB for localStorage)
    const MAX_FILE_SIZE = 2 * 1024 * 1024
    
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size is 2MB, your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`)
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = () => {
        try {
          const base64 = reader.result as string
          const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
          
          const fileData: StorageFile = {
            fileName,
            originalName: file.name,
            size: file.size,
            type: file.type,
            url: base64,
            uploadedAt: new Date().toISOString()
          }
          
          // Get existing files
          let files = this.getStoredFiles()
          
          // Check total storage
          const totalSize = files.reduce((sum, f) => sum + (f.url?.length || 0), 0) + base64.length
          const MAX_TOTAL_SIZE = 4 * 1024 * 1024 // 4MB total
          
          // Remove old files if needed
          while (totalSize > MAX_TOTAL_SIZE && files.length > 0) {
            files.shift()
          }
          
          files.push(fileData)
          
          // Store files
          try {
            localStorage.setItem(this.storageKey, JSON.stringify(files))
          } catch (e) {
            // Clear and retry with just this file
            localStorage.setItem(this.storageKey, JSON.stringify([fileData]))
          }
          
          resolve({
            url: base64,
            fileName,
            size: file.size
          })
        } catch (error) {
          reject(error)
        }
      }
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }
      
      reader.readAsDataURL(file)
    })
  }

  async deleteFile(fileName: string): Promise<boolean> {
    try {
      const files = this.getStoredFiles()
      const filtered = files.filter(f => f.fileName !== fileName)
      localStorage.setItem(this.storageKey, JSON.stringify(filtered))
      return true
    } catch {
      return false
    }
  }

  async listFiles(): Promise<StorageFile[]> {
    return this.getStoredFiles()
  }

  getFileUrl(fileName: string): string {
    const files = this.getStoredFiles()
    const file = files.find(f => f.fileName === fileName)
    return file?.url || ''
  }

  private getStoredFiles(): StorageFile[] {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]')
    } catch {
      return []
    }
  }
}

// Export singleton instances
export const localResourcesStorage = new LocalStorageAdapter(`${STORAGE_PREFIX}resources_files`)
export const localNewsletterStorage = new LocalStorageAdapter(`${STORAGE_PREFIX}newsletters_files`)