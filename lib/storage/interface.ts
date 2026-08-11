// Storage interface for abstraction
export interface FileUploadResult {
  url: string
  fileName: string
  size: number
  publicUrl?: string
}

export interface StorageFile {
  id?: string
  fileName: string
  originalName: string
  size: number
  type: string
  url: string
  publicUrl?: string
  uploadedAt: string
  uploadedBy?: string
}

export interface StorageAdapter {
  uploadFile(file: File, path?: string): Promise<FileUploadResult>
  deleteFile(fileName: string, path?: string): Promise<boolean>
  listFiles(path?: string): Promise<StorageFile[]>
  getFileUrl(fileName: string, path?: string): string
}