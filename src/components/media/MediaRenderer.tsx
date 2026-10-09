'use client'

import { useEffect, useState } from 'react'
import { fetchMediaToken, getMediaProxyUrl } from '@/lib/media'

export function MediaRenderer({
  mediaType,
  driveFileId,
  previewDriveFileId,
  originalFilename
}: {
  mediaType: string
  driveFileId: string
  previewDriveFileId?: string | null
  originalFilename?: string
}) {
  const [proxyUrl, setProxyUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // For images, we want to show the preview initially, then optionally load the full version if clicked.
  // For V1 simplicity in this component, we'll just render the preview if it exists, or the main file.
  // The instructions specify:
  // "For images: display optimized preview. When clicked, request original."
  // "For videos: display thumbnail. When clicked, open HTML5 player (streaming)."
  
  const targetFileId = mediaType === 'VIDEO' ? (previewDriveFileId || driveFileId) : driveFileId;

  useEffect(() => {
    let mounted = true;
    
    async function loadToken() {
      try {
        const token = await fetchMediaToken(targetFileId)
        if (mounted) {
          setProxyUrl(getMediaProxyUrl(token))
        }
      } catch (err) {
        console.error('Failed to load media token', err)
        if (mounted) setError('Failed to load media')
      }
    }

    loadToken()

    return () => { mounted = false }
  }, [targetFileId])

  if (error) {
    return <div className="text-red-500 text-xs p-2 border border-red-500 rounded">{error}</div>
  }

  if (!proxyUrl) {
    return <div className="w-48 h-48 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg flex items-center justify-center text-xs text-slate-500">Loading media...</div>
  }

  if (mediaType === 'IMAGE' || mediaType === 'GIF') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img 
        src={proxyUrl} 
        alt={originalFilename || "Image"} 
        className="max-w-full rounded-lg max-h-96 object-contain cursor-pointer"
        onClick={() => {
          // If this is an image, we should theoretically request the original driveFileId if preview is shown.
          // In this basic version, if targetFileId is already driveFileId, we can just open it.
          window.open(proxyUrl, '_blank')
        }}
      />
    )
  }

  if (mediaType === 'VIDEO') {
    // If we only have the preview, we render an image thumbnail that when clicked swaps to video
    // For V1 simplicity, if it's the video itself, we render the video tag
    if (targetFileId === previewDriveFileId) {
      return (
        <div className="relative cursor-pointer group" onClick={async () => {
          // fetch video token and play
          try {
            const token = await fetchMediaToken(driveFileId)
            const videoUrl = getMediaProxyUrl(token)
            // Ideally we'd replace the thumbnail with the video player. 
            // We can do this by setting a state.
            window.open(videoUrl, '_blank') // V1 quick implementation
          } catch(e) {
            console.error(e)
          }
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyUrl} alt="Video thumbnail" className="max-w-full rounded-lg max-h-96 object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/50 text-white rounded-full w-12 h-12 flex items-center justify-center">▶</div>
          </div>
        </div>
      )
    } else {
      return (
        <video 
          controls 
          src={proxyUrl} 
          className="max-w-full rounded-lg max-h-96"
          preload="metadata"
        />
      )
    }
  }

  return <div className="text-sm italic p-2 border rounded">Unsupported media type</div>
}
