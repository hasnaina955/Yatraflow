import { Capacitor } from '@capacitor/core'
import type { MouseEvent } from 'react'

type AppHash = `#/${string}`
type LinkClick = Pick<MouseEvent, 'button' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'defaultPrevented'>

/** Web links must escape /i/<id>; native and file builds keep their document path. */
export function appLinkHref(hash: AppHash, native = false, protocol = 'https:'): string {
  return !native && /^https?:$/.test(protocol) ? `/${hash}` : hash
}

export function shouldHandleAppLink(event: LinkClick, target = '', download = false): boolean {
  return !event.defaultPrevented && event.button === 0 &&
    !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
    (!target || target === '_self') && !download
}

/** Spread onto a real anchor: browser-owned new tabs, hash-only same-tab navigation. */
export function appLink(hash: AppHash) {
  return {
    href: appLinkHref(hash, Capacitor.isNativePlatform(), location.protocol),
    onClick(event: MouseEvent<HTMLAnchorElement>) {
      if (!shouldHandleAppLink(event, event.currentTarget.target, event.currentTarget.hasAttribute('download'))) return
      event.preventDefault()
      location.hash = hash
    },
  }
}
