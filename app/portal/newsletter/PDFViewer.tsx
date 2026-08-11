'use client';

import { useState } from 'react';
import { IconX, IconDownload, IconExternalLink, IconMaximize, IconMinimize } from '@tabler/icons-react';
import Modal from '@/components/ui/Modal';

interface PDFViewerProps {
  pdfUrl: string;
  title: string;
  onClose: () => void;
}

export default function PDFViewer({ pdfUrl, title, onClose }: PDFViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const renderContent = () => {
    if (iframeError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-gray-600 dark:text-gray-300">Unable to preview PDF in browser</p>
          <div className="flex gap-3">
            <a
              href={pdfUrl}
              download
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <IconDownload className="h-5 w-5" />
              Download PDF
            </a>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
            >
              <IconExternalLink className="h-5 w-5" />
              Open in New Tab
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full">
        <object
          data={pdfUrl}
          type="application/pdf"
          className="w-full h-full"
        >
          <iframe
            src={`${pdfUrl}#view=FitH`}
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
            <a
              href={pdfUrl}
              download
              className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded"
              title="Download"
            >
              <IconDownload className="h-5 w-5" />
            </a>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded"
              title="Open in new tab"
            >
              <IconExternalLink className="h-5 w-5" />
            </a>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title="Close"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden mt-4 -mx-6 -mb-6 px-0">
          {renderContent()}
        </div>
      </div>
    </Modal>
  );
}
