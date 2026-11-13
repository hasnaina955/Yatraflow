// ============ One truthful retry-disposition presentation (#08 F3) ============
// Shared by Map, shortlist, arc and Timeline. Every WriterResumeDisposition has
// its own line and terminal/recovery action. No surface defaults a changed,
// unknown or unverifiable retry to "already completed".
import type { WriterResumeDisposition } from './mapWriterActions'

export interface WriterResumePresentation {
  text: string
  /** True when the visible retry must be retired; the gate record/reservation
   *  stays until a real ack or proven discard. */
  terminal: boolean
}

const COPY: Record<WriterResumeDisposition, WriterResumePresentation> = {
  'payload-changed': {
    text: 'Retry · Save replaced · Check Saved edits',
    terminal: true,
  },
  'resume-unverifiable': {
    text: 'Retry · Save unconfirmed · Check Saved edits',
    terminal: true,
  },
  'operation-settled': {
    text: 'Save · Complete · Check Saved edits',
    terminal: true,
  },
  'operation-unknown': {
    text: 'Retry · Save unavailable · Check Saved edits',
    terminal: true,
  },
  'road-changed': {
    text: 'Retry · Road changed · Check Saved edits',
    terminal: true,
  },
  'trip-changed': {
    text: 'Retry · Trip changed · Check Saved edits',
    terminal: true,
  },
}

export function writerResumePresentation(disposition: WriterResumeDisposition): WriterResumePresentation {
  return COPY[disposition]
}

export const CURRENT_TRIP_UNAVAILABLE_COPY =
  'Retry · Saved trip unavailable'
