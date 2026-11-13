import { useCallback, useEffect, useRef, useState } from 'react'
import { Map as MapIcon } from 'lucide-react'
import { useMap } from '../mapcn/map'
import { WORKSPACE_MAP_STYLES } from '../../lib/workspaceMapStyles'

type Failure = { theme: 'light' | 'dark'; phase: 'failed' | 'retrying' } | null

export function useWorkspaceBasemapStatus(theme: 'light' | 'dark') {
  const [failure, setFailure] = useState<Failure>(null)
  const current = useRef<Failure>(null)
  const change = useCallback((next: Failure) => { current.current = next; setFailure(next) }, [])
  const onMapError = useCallback((event: object, styleName: string | undefined) => {
    if ('sourceId' in event && event.sourceId === 'openmaptiles' && styleName === WORKSPACE_MAP_STYLES[theme].name) {
      change({ theme, phase: 'failed' })
      return true
    }
    return false
  }, [theme, change])
  const onRetry = useCallback(() => change({ theme, phase: 'retrying' }), [theme, change])
  const onSourceReady = useCallback((readyTheme: 'light' | 'dark') => {
    if (current.current?.theme === readyTheme && current.current.phase === 'retrying') change(null)
  }, [change])
  return { failure, onMapError, onRetry, onSourceReady }
}

export function MapBasemapStatus({ failure, onRetry, onSourceReady }: Pick<ReturnType<typeof useWorkspaceBasemapStatus>, 'failure' | 'onRetry' | 'onSourceReady'>) {
  const { map, resolvedTheme } = useMap()
  useEffect(() => {
    if (!map) return
    const onData = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (event.sourceId === 'openmaptiles' && event.isSourceLoaded && map.getStyle()?.name === WORKSPACE_MAP_STYLES[resolvedTheme].name) onSourceReady(resolvedTheme)
    }
    map.on('sourcedata', onData)
    return () => { map.off('sourcedata', onData) }
  }, [map, resolvedTheme, onSourceReady])

  if (!failure || failure.theme !== resolvedTheme) return null
  const retrying = failure.phase === 'retrying'
  return <div className="mv2-basemap-status" role="status">
    <MapIcon size={18} aria-hidden="true" />
    <span>{retrying ? 'Loading the map again…' : 'Map tiles · Unavailable · Stops and route visible'}</span>
    <button type="button" className="btn btn-sm btn-outline" disabled={retrying} onClick={() => {
      const source = map?.getSource('openmaptiles')
      if (source?.type !== 'vector' || !('setUrl' in source) || typeof source.setUrl !== 'function') return
      onRetry()
      source.setUrl('https://tiles.openfreemap.org/planet')
    }}>Try map again</button>
  </div>
}
