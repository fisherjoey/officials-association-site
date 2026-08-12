'use client'

import { useState } from 'react'
import { IconX, IconDownload, IconExternalLink, IconMaximize, IconMinimize, IconLink, IconArticle } from '@tabler/icons-react'
import { HTMLViewer } from './HTMLViewer'
import Modal from '@/components/ui/Modal'
import FileDownloadLink from '@/components/FileDownloadLink'
import { useFileUrl } from '@/hooks/useFileUrl'

interface ResourceViewerProps {
  resource: {
    title: string
    /**
     * The stored reference — `storage://bucket/path` for an uploaded file, a
     * plain URL for anything else. Signed here, once, when the viewer opens.
     */
    fileUrl?: string
    externalLink?: string
    description?: string
    fileSize?: string
    resourceType?: 'file' | 'link' | 'video' | 'text'
  }
  onClose: () => void
}

export default function ResourceViewer({ resource, onClose }: ResourceViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [iframeError, setIframeError] = useState(false)
  // Minted when the modal opens, so the link lives about as long as the view
  // it was rendered for. The file type is read off the stored reference
  // rather than this URL — a signed URL carries a `?token=` the extension
  // sniffing below would swallow.
  const { url: fileUrl, isLoading: isResolvingFile, error: fileError } = useFileUrl(resource.fileUrl)

  const getFileType = (url: string) => {
    const extension = url.split('.').pop()?.toLowerCase()

    if (['pdf'].includes(extension || '')) return 'pdf'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) return 'image'
    if (['mp4', 'webm', 'ogg', 'mov'].includes(extension || '')) return 'video'
    if (['mp3', 'wav', 'ogg'].includes(extension || '')) return 'audio'
    if (['doc', 'docx'].includes(extension || '')) return 'word'
    if (['xls', 'xlsx'].includes(extension || '')) return 'excel'
    if (['ppt', 'pptx'].includes(extension || '')) return 'powerpoint'

    return 'other'
  }

  const fileType = resource.fileUrl ? getFileType(resource.fileUrl) : null

  const renderContent = () => {
    // Handle text type resources - show the HTML content
    if (resource.resourceType === 'text' && resource.description) {
      return (
        <div className="p-6 overflow-auto h-full">
          <HTMLViewer content={resource.description} className="prose max-w-none" />
        </div>
      )
    }

    // Handle link type resources - show link info with button to open
    if (resource.resourceType === 'link' && resource.externalLink) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
          <IconLink className="h-16 w-16 text-gray-400" />
          <div className="text-center">
            <p className="text-gray-600 mb-2">External Link</p>
            <p className="text-sm text-gray-500 break-all max-w-md">{resource.externalLink}</p>
          </div>
          <a
            href={resource.externalLink}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-lg"
          >
            <IconExternalLink className="h-5 w-5" />
            Open Link
          </a>
          {resource.description && (
            <p className="text-sm text-gray-500 max-w-md text-center">{resource.description}</p>
          )}
        </div>
      )
    }

    // Handle video type resources
    if (resource.resourceType === 'video' && resource.externalLink) {
      // YouTube embed
      if (resource.externalLink.includes('youtube.com') || resource.externalLink.includes('youtu.be')) {
        const videoId = resource.externalLink.includes('youtu.be')
          ? resource.externalLink.split('/').pop()
          : resource.externalLink.split('v=')[1]?.split('&')[0]

        return (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            className="w-full h-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        )
      }

      // Vimeo embed
      if (resource.externalLink.includes('vimeo.com')) {
        const videoId = resource.externalLink.split('/').pop()
        return (
          <iframe
            src={`https://player.vimeo.com/video/${videoId}`}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture"
          />
        )
      }

      // Google Drive embed
      if (resource.externalLink.includes('drive.google.com')) {
        // Handle various Google Drive URL formats
        let embedUrl = resource.externalLink

        // If it's already a /preview URL, use it directly
        if (!embedUrl.includes('/preview')) {
          // Extract file ID from various formats
          // Format: /file/d/FILE_ID/view or /file/d/FILE_ID/edit etc.
          const match = embedUrl.match(/\/file\/d\/([^/]+)/)
          if (match) {
            embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`
          }
        }

        return (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; fullscreen"
          />
        )
      }

      // Other video links - show button to open
      return (
        <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
          <IconExternalLink className="h-16 w-16 text-gray-400" />
          <div className="text-center">
            <p className="text-gray-600 mb-2">Video Link</p>
            <p className="text-sm text-gray-500 break-all max-w-md">{resource.externalLink}</p>
          </div>
          <a
            href={resource.externalLink}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 flex items-center gap-2 text-lg"
          >
            <IconExternalLink className="h-5 w-5" />
            Watch Video
          </a>
        </div>
      )
    }

    // Legacy handling for external links without resourceType
    if (resource.externalLink && !resource.fileUrl) {
      // For YouTube/Vimeo, embed
      if (resource.externalLink.includes('youtube.com') || resource.externalLink.includes('youtu.be')) {
        const videoId = resource.externalLink.includes('youtu.be')
          ? resource.externalLink.split('/').pop()
          : resource.externalLink.split('v=')[1]?.split('&')[0]

        return (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            className="w-full h-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        )
      }

      if (resource.externalLink.includes('vimeo.com')) {
        const videoId = resource.externalLink.split('/').pop()
        return (
          <iframe
            src={`https://player.vimeo.com/video/${videoId}`}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture"
          />
        )
      }

      // Google Drive embed (legacy)
      if (resource.externalLink.includes('drive.google.com')) {
        let embedUrl = resource.externalLink
        if (!embedUrl.includes('/preview')) {
          const match = embedUrl.match(/\/file\/d\/([^/]+)/)
          if (match) {
            embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`
          }
        }
        return (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; fullscreen"
          />
        )
      }

      // For other external links, show a button instead of iframe
      return (
        <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
          <IconLink className="h-16 w-16 text-gray-400" />
          <div className="text-center">
            <p className="text-gray-600 mb-2">External Link</p>
            <p className="text-sm text-gray-500 break-all max-w-md">{resource.externalLink}</p>
          </div>
          <a
            href={resource.externalLink}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-lg"
          >
            <IconExternalLink className="h-5 w-5" />
            Open Link
          </a>
        </div>
      )
    }

    if (!resource.fileUrl) return null

    if (isResolvingFile) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">Opening file…</div>
      )
    }

    if (fileError || !fileUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
          <p className="text-gray-600">{fileError || 'This file could not be opened.'}</p>
        </div>
      )
    }

    switch (fileType) {
      case 'pdf':
        if (iframeError) {
          return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-gray-600">Unable to preview PDF in browser</p>
              <div className="flex gap-3">
                <FileDownloadLink
                  fileRef={resource.fileUrl}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <IconDownload className="h-5 w-5" />
                  Download PDF
                </FileDownloadLink>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
                >
                  <IconExternalLink className="h-5 w-5" />
                  Open in New Tab
                </a>
              </div>
            </div>
          )
        }
        return (
          <div className="w-full h-full">
            <object
              data={fileUrl}
              type="application/pdf"
              className="w-full h-full"
            >
              <iframe
                src={`${fileUrl}#view=FitH`}
                className="w-full h-full"
                title={resource.title}
              />
            </object>
          </div>
        )

      case 'image':
        return (
          <div className="flex items-center justify-center h-full bg-gray-100">
            <img
              src={fileUrl}
              alt={resource.title}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )

      case 'video':
        return (
          <video
            src={fileUrl}
            controls
            className="w-full h-full"
            controlsList="nodownload"
          >
            Your browser does not support the video tag.
          </video>
        )

      case 'audio':
        return (
          <div className="flex items-center justify-center h-full">
            <audio
              src={fileUrl}
              controls
              className="w-full max-w-md"
            >
              Your browser does not support the audio tag.
            </audio>
          </div>
        )

      case 'word':
      case 'excel':
      case 'powerpoint':
        // Office files can't be previewed directly - show download/open options
        const fileTypeLabels = {
          word: 'Word Document',
          excel: 'Excel Spreadsheet',
          powerpoint: 'PowerPoint Presentation'
        }
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
            <IconArticle className="h-16 w-16 text-gray-400" />
            <div className="text-center">
              <p className="text-gray-600 mb-2">{fileTypeLabels[fileType]}</p>
              <p className="text-sm text-gray-500">Preview not available for this file type</p>
            </div>
            <div className="flex gap-3">
              <FileDownloadLink
                fileRef={resource.fileUrl}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <IconDownload className="h-5 w-5" />
                Download File
              </FileDownloadLink>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center gap-2"
              >
                <IconExternalLink className="h-5 w-5" />
                Open in New Tab
              </a>
            </div>
          </div>
        )

      default:
        return (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-gray-600">Preview not available for this file type</p>
            <FileDownloadLink
              fileRef={resource.fileUrl}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <IconDownload className="h-5 w-5" />
              Download File
            </FileDownloadLink>
          </div>
        )
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="full"
      showCloseButton={false}
    >
      <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-[60] bg-white' : 'h-full'}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b -mx-6 -mt-6 px-6 pt-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold truncate">{resource.title}</h2>
            {resource.description && resource.resourceType !== 'text' && (
              <p className="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2">{resource.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
              title={isFullscreen ? "Exit fullscreen" : "Toggle fullscreen"}
            >
              {isFullscreen ? <IconMinimize className="h-5 w-5" /> : <IconMaximize className="h-5 w-5" />}
            </button>
            {resource.fileUrl && (
              <FileDownloadLink
                fileRef={resource.fileUrl}
                className="p-2 text-blue-400 hover:text-blue-800 hover:bg-blue-50 rounded"
                title="Download"
              >
                <IconDownload className="h-5 w-5" />
              </FileDownloadLink>
            )}
            {resource.externalLink && (
              <a
                href={resource.externalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-blue-400 hover:text-blue-800 hover:bg-blue-50 rounded"
                title="Open in new tab"
              >
                <IconExternalLink className="h-5 w-5" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
              title="Close"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden mt-4 -mx-6 px-0">
          {renderContent()}
        </div>

        {/* Footer */}
        {resource.fileSize && (
          <div className="px-0 py-2 border-t text-sm text-gray-500 -mx-6 -mb-6 px-6">
            File size: {resource.fileSize}
          </div>
        )}
      </div>
    </Modal>
  )
}
