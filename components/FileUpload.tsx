'use client'

import { useCallback } from 'react'
import { useDropzone, Accept } from 'react-dropzone'
import { IconUpload, IconX, IconFile } from '@tabler/icons-react'

interface FileUploadProps {
  onFileSelect: (file: File | null) => void
  selectedFile?: File | null
  accept?: string
  maxSize?: number // in MB
  className?: string
  buttonText?: string
  showFileName?: boolean
}

export default function FileUpload({
  onFileSelect,
  selectedFile,
  accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
  maxSize = 10,
  className = '',
  buttonText = 'Choose File',
  showFileName = true
}: FileUploadProps) {
  // Convert accept string to react-dropzone Accept format
  const getAcceptObject = useCallback((): Accept => {
    const mimeTypes: Accept = {}
    const extensions = accept.split(',').map(ext => ext.trim())

    extensions.forEach(ext => {
      switch (ext.toLowerCase()) {
        case '.pdf':
          mimeTypes['application/pdf'] = ['.pdf']
          break
        case '.doc':
          mimeTypes['application/msword'] = ['.doc']
          break
        case '.docx':
          mimeTypes['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] = ['.docx']
          break
        case '.xls':
          mimeTypes['application/vnd.ms-excel'] = ['.xls']
          break
        case '.xlsx':
          mimeTypes['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] = ['.xlsx']
          break
        case '.ppt':
          mimeTypes['application/vnd.ms-powerpoint'] = ['.ppt']
          break
        case '.pptx':
          mimeTypes['application/vnd.openxmlformats-officedocument.presentationml.presentation'] = ['.pptx']
          break
        default:
          // For any other extension, try to add it generically
          if (ext.startsWith('.')) {
            mimeTypes['application/octet-stream'] = [...(mimeTypes['application/octet-stream'] || []), ext]
          }
      }
    })

    return mimeTypes
  }, [accept])

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0]
      if (rejection.errors.some((e: any) => e.code === 'file-too-large')) {
        alert(`File size exceeds ${maxSize}MB limit`)
      } else if (rejection.errors.some((e: any) => e.code === 'file-invalid-type')) {
        alert(`Invalid file type. Accepted formats: ${accept}`)
      }
      return
    }

    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0])
    }
  }, [maxSize, accept, onFileSelect])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: getAcceptObject(),
    maxSize: maxSize * 1024 * 1024, // Convert MB to bytes
    multiple: false,
    noClick: true, // We'll handle click with custom button
    noKeyboard: true
  })

  const handleClearFile = () => {
    onFileSelect(null)
  }

  const formatFileSize = (bytes: number): string => {
    return (bytes / (1024 * 1024)).toFixed(2)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer
          ${isDragActive
            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
        `}
      >
        <input {...getInputProps()} />

        {selectedFile && showFileName ? (
          // File selected state
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-900/30 rounded-lg flex items-center justify-center">
              <IconFile className="h-5 w-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatFileSize(selectedFile.size)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleClearFile()
              }}
              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Remove file"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        ) : (
          // Empty state / drag state
          <div className="text-center">
            <IconUpload className={`mx-auto h-8 w-8 ${isDragActive ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'}`} />
            <p className={`mt-2 text-sm ${isDragActive ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300'}`}>
              {isDragActive ? 'Drop file here...' : 'Drag and drop a file here, or'}
            </p>
            {!isDragActive && (
              <button
                type="button"
                onClick={open}
                className="mt-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors"
              >
                {buttonText}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Accepted formats: {accept.split(',').join(', ')} (max {maxSize}MB)
      </p>
    </div>
  )
}
