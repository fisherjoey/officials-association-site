'use client';

import { useState } from 'react';
import { IconX, IconDownload, IconExternalLink, IconMaximize, IconMinimize } from '@tabler/icons-react';
import Modal from '@/components/ui/Modal';
import FileDownloadLink from '@/components/FileDownloadLink';
import { useFileUrl } from '@/hooks/useFileUrl';

interface PDFViewerProps {
  /**
   * The stored reference — `storage://bucket/path` for a newsletter in the
   * private bucket, or a plain URL. Signed once when the viewer opens, for
   * the embed only; the two buttons sign inside their own click.
   */
  pdfUrl: string;
  title: string;
  onClose: () => void;
}

export default function PDFViewer({ pdfUrl, title, onClose }: PDFViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const { url: resolvedUrl, isLoading, error: resolveError } = useFileUrl(pdfUrl);
  // A button whose mint was refused. The embed reports its own failure in
  // place of the content; a click that went nowhere has to say so somewhere.
  const [linkError, setLinkError] = useState<string | null>(null);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">Opening newsletter…</div>
      );
    }

    if (resolveError || !resolvedUrl) {
      return (
        <div className="flex items-center justify-center h-full p-6 text-center text-gray-600 dark:text-gray-300">
          {resolveError || 'This newsletter could not be opened.'}
        </div>
      );
    }

    if (iframeError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-gray-600 dark:text-gray-300">Unable to preview PDF in browser</p>
          <div className="flex gap-3">
            <FileDownloadLink
              fileRef={pdfUrl}
              fileName={`${title}.pdf`}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              onError={setLinkError}
            >
              <IconDownload className="h-5 w-5" />
              Download PDF
            </FileDownloadLink>
            <FileDownloadLink
              fileRef={pdfUrl}
              fileName={`${title}.pdf`}
              mode="view"
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
              onError={setLinkError}
            >
              <IconExternalLink className="h-5 w-5" />
              Open in New Tab
            </FileDownloadLink>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full">
        <object
          data={resolvedUrl}
          type="application/pdf"
          className="w-full h-full"
        >
          <iframe
            src={`${resolvedUrl}#view=FitH`}
            className="w-full h-full"
            title={title}
          />
        </object>
      </div>
    );
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="full"
      showCloseButton={false}
    >
      <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-[60] bg-white dark:bg-gray-800' : 'h-full'}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-200 dark:border-gray-700 -mx-6 -mt-6 px-6 pt-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold truncate text-gray-900 dark:text-white">{title}</h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title={isFullscreen ? "Exit fullscreen" : "Toggle fullscreen"}
            >
              {isFullscreen ? <IconMinimize className="h-5 w-5" /> : <IconMaximize className="h-5 w-5" />}
            </button>
            <FileDownloadLink
              fileRef={pdfUrl}
              fileName={`${title}.pdf`}
              className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded"
              title="Download"
              onError={setLinkError}
            >
              <IconDownload className="h-5 w-5" />
            </FileDownloadLink>
            <FileDownloadLink
              fileRef={pdfUrl}
              fileName={`${title}.pdf`}
              mode="view"
              className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded"
              title="Open in new tab"
              onError={setLinkError}
            >
              <IconExternalLink className="h-5 w-5" />
            </FileDownloadLink>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title="Close"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {linkError && (
          <div
            role="alert"
            className="mt-3 -mx-6 px-6 py-2 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300"
          >
            {linkError}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden mt-4 -mx-6 -mb-6 px-0">
          {renderContent()}
        </div>
      </div>
    </Modal>
  );
}
