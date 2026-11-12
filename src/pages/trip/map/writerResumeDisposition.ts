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
    text: 'A different choice replaced this save, so the old retry cannot replay. Check Saved edits.',
    terminal: true,
  },
  'resume-unverifiable': {
    text: 'The earlier save is still unconfirmed and cannot be retried here. Check Saved edits.',
    terminal: true,
  },
  'operation-settled': {
    text: 'This save already has a settled outcome. Check Saved edits.',
    terminal: true,
  },
  'operation-unknown': {
    text: 'This save is no longer available to retry. Check Saved edits.',
    terminal: true,
  },
  'road-changed': {
    text: 'The measured road changed after this save; the retry cannot replay. Check Saved edits.',
    terminal: true,
  },
  'trip-changed': {
    text: 'The saved trip changed after Keep; the retry cannot replay. Check Saved edits.',
    terminal: true,
  },
}

export function writerResumePresentation(disposition: WriterResumeDisposition): WriterResumePresentation {
  return COPY[disposition]
}

export const CURRENT_TRIP_UNAVAILABLE_COPY =
  'The current saved trip is unavailable, so this retry cannot start.'
