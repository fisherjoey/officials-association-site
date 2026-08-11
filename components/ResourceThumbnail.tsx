'use client'

import { 
  IconFile,
  IconFileTypePdf,
  IconPhoto,
  IconVideo,
  IconMusic,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconFileTypePpt,
  IconFileText,
  IconWorld,
  IconBrandYoutube,
  IconBrandVimeo
} from '@tabler/icons-react'

interface ResourceThumbnailProps {
  resource: {
    title: string
    fileUrl?: string
    externalLink?: string
  }
  size?: 'small' | 'medium' | 'large'
  onClick?: () => void
}

export default function ResourceThumbnail({ resource, size = 'medium', onClick }: ResourceThumbnailProps) {
  const getFileType = (url: string) => {
    const extension = url.split('.').pop()?.toLowerCase()
    
    if (['pdf'].includes(extension || '')) return 'pdf'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) return 'image'
    if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(extension || '')) return 'video'
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension || '')) return 'audio'
    if (['doc', 'docx'].includes(extension || '')) return 'word'
    if (['xls', 'xlsx'].includes(extension || '')) return 'excel'
    if (['ppt', 'pptx'].includes(extension || '')) return 'powerpoint'
    if (['txt', 'md', 'rtf'].includes(extension || '')) return 'text'
    
    return 'other'
  }
  
  const getExternalType = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
    if (url.includes('vimeo.com')) return 'vimeo'
    return 'website'
  }
  
  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-16 h-16',
    large: 'w-24 h-24'
  }
  
  const iconSizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-10 h-10',
    large: 'w-14 h-14'
  }
  
  const fileType = resource.fileUrl ? getFileType(resource.fileUrl) : null
  const externalType = resource.externalLink && !resource.fileUrl ? getExternalType(resource.externalLink) : null
  
  // For images, show actual thumbnail
  if (fileType === 'image' && resource.fileUrl) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
        onClick={onClick}>
        <img
          src={resource.fileUrl}
          alt={resource.title}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to icon if image fails to load
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            const parent = target.parentElement
            if (parent) {
              parent.innerHTML = `<svg class="${iconSizeClasses[size]} text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`
            }
          }}
        />
      </div>
    )
  }
  
  // For YouTube videos, show thumbnail
  if (externalType === 'youtube' && resource.externalLink) {
    const videoId = resource.externalLink.includes('youtu.be') 
      ? resource.externalLink.split('/').pop()
      : resource.externalLink.split('v=')[1]?.split('&')[0]
    
    if (videoId) {
      return (
        <div
          className={`${sizeClasses[size]} rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center relative ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
          onClick={onClick}>
          <img
            src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
            alt={resource.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to YouTube icon if thumbnail fails
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <IconBrandYoutube className={`${iconSizeClasses[size]} text-red-600 bg-white rounded-full p-1`} />
          </div>
        </div>
      )
    }
  }
  
  // Icon-based thumbnails for other file types
  let Icon = IconFile
  let bgColor = 'bg-gray-100 dark:bg-gray-700'
  let iconColor = 'text-gray-600 dark:text-gray-300'

  switch (fileType || externalType) {
    case 'pdf':
      Icon = IconFileTypePdf
      bgColor = 'bg-red-50 dark:bg-red-900/60'
      iconColor = 'text-red-600 dark:text-red-300'
      break
    case 'word':
      Icon = IconFileTypeDoc
      bgColor = 'bg-blue-900/60'
      iconColor = 'text-blue-400'
      break
    case 'excel':
      Icon = IconFileTypeXls
      bgColor = 'bg-green-50 dark:bg-green-900/60'
      iconColor = 'text-green-600 dark:text-green-300'
      break
    case 'powerpoint':
      Icon = IconFileTypePpt
      bgColor = 'bg-orange-50 dark:bg-orange-900/60'
      iconColor = 'text-orange-600 dark:text-orange-300'
      break
    case 'video':
      Icon = IconVideo
      bgColor = 'bg-purple-50 dark:bg-purple-900/60'
      iconColor = 'text-purple-600 dark:text-purple-300'
      break
    case 'audio':
      Icon = IconMusic
      bgColor = 'bg-pink-50 dark:bg-pink-900/60'
      iconColor = 'text-pink-600 dark:text-pink-300'
      break
    case 'text':
      Icon = IconFileText
      bgColor = 'bg-gray-50 dark:bg-gray-700'
      iconColor = 'text-gray-600 dark:text-gray-300'
      break
    case 'vimeo':
      Icon = IconBrandVimeo
      bgColor = 'bg-blue-900/60'
      iconColor = 'text-blue-400'
      break
    case 'website':
      Icon = IconWorld
      bgColor = 'bg-indigo-50 dark:bg-indigo-900/60'
      iconColor = 'text-indigo-600 dark:text-indigo-300'
      break
  }
  
  return (
    <div 
      className={`${sizeClasses[size]} ${bgColor} rounded-lg flex items-center justify-center ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      onClick={onClick}>
      <Icon className={`${iconSizeClasses[size]} ${iconColor}`} />
    </div>
  )
}