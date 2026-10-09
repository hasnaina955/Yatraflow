import { useState, type ReactNode } from 'react'

export interface EditorialPhotoProps {
  src?: string
  alt?: string
  className?: string
  children?: ReactNode
}

/** A failed photo keeps its surface, geometry, and overlay context. */
export function EditorialPhoto({ src, alt = '', className = '', children }: EditorialPhotoProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const source = src?.trim()
  const usable = Boolean(source && source !== failedSource)
  return (
    <div className={`editorial-photo ${className}`} data-photo-state={usable ? 'image' : 'fallback'}>
      {usable && <img className="editorial-photo-image" src={source} alt={alt}
        onError={() => setFailedSource(source!)} />}
      {children}
    </div>
  )
}
