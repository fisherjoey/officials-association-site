'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import DOMPurify from 'dompurify'

// Dynamically import MDEditor to avoid SSR issues
const MDEditor = dynamic(
  () => import('@uiw/react-md-editor'),
  { 
    ssr: false,
    loading: () => <div className="h-[400px] bg-gray-100 animate-pulse rounded-lg" />
  }
)

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  height?: number
  preview?: boolean
  placeholder?: string
  readOnly?: boolean
}

export function MarkdownEditor({ 
  value, 
  onChange, 
  height = 400,
  preview = true,
  placeholder = 'Enter content here...',
  readOnly = false
}: MarkdownEditorProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-[400px] bg-gray-100 animate-pulse rounded-lg" />
  }

  return (
    <>
      <style jsx global>{`
        .w-md-editor-toolbar {
          background-color: #ffffff !important;
          border-bottom: 2px solid #9ca3af !important;
          padding: 4px !important;
        }
        .w-md-editor-toolbar button {
          font-size: 20px !important;
          padding: 10px 14px !important;
          height: 40px !important;
          min-width: 40px !important;
          color: #000000 !important;
          font-weight: 600 !important;
          transition: all 0.2s !important;
        }
        .w-md-editor-toolbar button:hover {
          background-color: #e5e7eb !important;
          color: #000000 !important;
          transform: scale(1.05) !important;
        }
        .w-md-editor-toolbar button.active {
          background-color: #dc2626 !important;
          color: white !important;
        }
        .w-md-editor {
          background-color: white !important;
          border: 3px solid #6b7280 !important;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1) !important;
        }
        .w-md-editor:focus-within {
          border-color: #dc2626 !important;
          box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.15) !important;
        }
        /* Fix cursor misalignment - unset font properties that cause drift */
        .w-md-editor .title {
          line-height: unset !important;
          font-size: unset !important;
          font-weight: unset !important;
        }
        /* Remove all text formatting overrides to use vanilla editor defaults */
        .w-md-editor-text-pre .token.title {
          color: #1e40af !important;
        }
        .w-md-editor-text-pre .token.bold {
          color: #000000 !important;
        }
        .w-md-editor-text-pre .token.code {
          color: #dc2626 !important;
        }
        .w-md-editor-text-pre .token.list {
          color: #059669 !important;
        }
        .w-md-editor-preview {
          background-color: #ffffff !important;
        }
        .w-md-editor-preview .wmde-markdown {
          background-color: #ffffff !important;
          color: #000000 !important;
          font-weight: 500 !important;
        }
        .w-md-editor-preview-wrapper {
          background-color: #ffffff !important;
        }
        .w-md-editor-toolbar-divider {
          background-color: #9ca3af !important;
        }
      `}</style>
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || '')}
        height={height}
        preview={preview ? 'live' : 'edit'}
        data-color-mode="light"
        hideToolbar={readOnly}
        textareaProps={{
          placeholder: placeholder
        }}
        previewOptions={{
          components: {
            h1: ({children}: any) => <h1 style={{color: '#000000', fontSize: '1.875rem', fontWeight: '900', marginTop: '1rem', marginBottom: '0.5rem'}}>{children}</h1>,
            h2: ({children}: any) => <h2 style={{color: '#000000', fontSize: '1.5rem', fontWeight: '700', marginTop: '0.75rem', marginBottom: '0.5rem'}}>{children}</h2>,
            h3: ({children}: any) => <h3 style={{color: '#000000', fontSize: '1.25rem', fontWeight: '700', marginTop: '0.5rem', marginBottom: '0.25rem'}}>{children}</h3>,
            p: ({children}: any) => <p style={{color: '#000000', fontWeight: '500', marginBottom: '0.75rem', lineHeight: '1.75'}}>{children}</p>,
            strong: ({children}: any) => <strong style={{fontWeight: '900', color: '#000000'}}>{children}</strong>,
            ul: ({children}: any) => <ul style={{listStyleType: 'disc', listStylePosition: 'inside', color: '#000000', fontWeight: '500', marginBottom: '0.75rem'}}>{children}</ul>,
            ol: ({children}: any) => <ol style={{listStyleType: 'decimal', listStylePosition: 'inside', color: '#000000', fontWeight: '500', marginBottom: '0.75rem'}}>{children}</ol>,
            li: ({children}: any) => <li style={{marginLeft: '1rem', color: '#000000', fontWeight: '500'}}>{children}</li>,
            code: ({inline, children}: any) => 
              inline ? (
                <code style={{backgroundColor: '#fee2e2', color: '#b91c1c', padding: '0.125rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: '700'}}>{children}</code>
              ) : (
                <pre style={{backgroundColor: '#111827', color: '#ffffff', padding: '1rem', borderRadius: '0.5rem', overflow: 'auto', marginBottom: '0.75rem', border: '2px solid #4b5563'}}>
                  <code style={{fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: '500'}}>{children}</code>
                </pre>
              )
          }
        }}
      />
    </>
  )
}

interface MarkdownViewerProps {
  content: string
  className?: string
}

export function MarkdownViewer({ content, className = '' }: MarkdownViewerProps) {
  const sanitizeContent = (content: string) => {
    if (typeof window !== 'undefined') {
      const clean = DOMPurify.sanitize(content, {
        FORBID_TAGS: ['style', 'script', 'link', 'meta'],
        FORBID_ATTR: ['style', 'class'],
        ALLOW_DATA_ATTR: false
      })
      return clean
    }
    return content
  }

  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({children}) => <h1 className="text-3xl font-black text-black mt-4 mb-2">{children}</h1>,
          h2: ({children}) => <h2 className="text-2xl font-bold text-black mt-3 mb-2">{children}</h2>,
          h3: ({children}) => <h3 className="text-xl font-bold text-black mt-2 mb-1">{children}</h3>,
          p: ({children}) => <p className="text-black font-medium mb-3 leading-relaxed text-base">{children}</p>,
          ul: ({children}) => <ul className="list-disc list-inside text-black font-medium mb-3 space-y-1">{children}</ul>,
          ol: ({children}) => <ol className="list-decimal list-inside text-black font-medium mb-3 space-y-1">{children}</ol>,
          li: ({children}) => <li className="ml-4 text-black font-medium">{children}</li>,
          blockquote: ({children}) => (
            <blockquote className="border-l-4 border-blue-600 bg-blue-50 pl-4 py-3 pr-3 italic my-3 text-black font-medium">{children}</blockquote>
          ),
          code: ({children, ...props}: any) =>
            props.inline ? (
              <code className="bg-red-100 text-red-700 px-2 py-1 rounded text-sm font-mono font-bold">{children}</code>
            ) : (
              <pre className="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-3 border-2 border-gray-700">
                <code className="text-sm font-mono font-medium">{children}</code>
              </pre>
            ),
          a: ({href, children}) => (
            <a href={href} className="text-blue-700 hover:text-blue-900 hover:underline font-bold" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          strong: ({children}) => <strong className="font-black text-black">{children}</strong>,
          em: ({children}) => <em className="italic text-black font-semibold">{children}</em>,
          hr: () => <hr className="my-4 border-gray-600 border-2" />,
          table: ({children}) => (
            <table className="min-w-full divide-y divide-gray-400 border-2 border-gray-400 mb-3">{children}</table>
          ),
          thead: ({children}) => <thead className="bg-gray-200">{children}</thead>,
          tbody: ({children}) => <tbody className="divide-y divide-gray-300 bg-white">{children}</tbody>,
          th: ({children}) => (
            <th className="px-3 py-2 text-left text-sm font-bold text-black uppercase tracking-wider border-b-2 border-gray-400">
              {children}
            </th>
          ),
          td: ({children}) => (
            <td className="px-3 py-2 whitespace-nowrap text-sm text-black font-medium border-gray-300">{children}</td>
          ),
        }}
      >
        {sanitizeContent(content)}
      </ReactMarkdown>
    </div>
  )
}