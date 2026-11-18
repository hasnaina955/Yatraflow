import posthog, { isPostHogConfigured } from './posthog'

type LogAttributes = Record<string, string | number | boolean>

/** Sends only purpose-written application records to PostHog Logs. */
export const posthogLog = {
  info(message: string, attributes: LogAttributes = {}): void {
    if (!isPostHogConfigured) return
    try {
      posthog.logger.info(message, attributes)
    } catch {
      // Observability must never interrupt the user-facing action.
    }
  },
}
