// ===== Form error announcement split: one assertive beat, polite field rows ====
// The create form's empty submit used to fire one interrupting role=alert per
// failing field (three measured live). The split: Field's error text is POLITE
// (role=status, still aria-describedby-bound to its control), and the page's
// FormErrorSummary carries the ONE assertive announcement, prefixed with the
// field's label. This file pins both halves so neither silently reverts.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Field, FormErrorSummary } from '../src/components/ui'

describe('Field error politeness', () => {
  it('renders a field error as polite status, not an assertive alert', () => {
    const html = renderToString(createElement(Field, { label: 'Starting location', error: 'Where does the journey start?' },
      createElement('input', { className: 'input' })))
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('role="alert"')
    // still programmatically bound so tabbing to the field repeats the message
    expect(html).toMatch(/aria-describedby="[^"]+"/)
    expect(html).toMatch(/aria-invalid="true"/)
  })

  it('a hint-only field announces nothing', () => {
    const html = renderToString(createElement(Field, { label: 'Password', hint: 'At least 8 characters' },
      createElement('input', { className: 'input', type: 'password' })))
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain('role="status"')
  })
})

describe('FormErrorSummary - the one assertive beat', () => {
  it('announces the first error assertively, prefixed with the field label', () => {
    const html = renderToString(createElement(FormErrorSummary, {
      errors: { name: 'Name your trip.', startLocation: 'Where does the journey start?' },
      labels: { name: 'Trip name', startLocation: 'Starting location' },
    }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="assertive"')
    expect(html).toContain('Trip name: Name your trip.')
    // only the FIRST error - the rest are the field rows' polite business
    expect(html).not.toContain('Where does the journey start?')
  })

  it('an error key without a label announces the bare message', () => {
    const html = renderToString(createElement(FormErrorSummary, { errors: { destinations: 'Add at least one destination.' } }))
    expect(html).toContain('Add at least one destination.')
    expect(html).not.toContain(':')
  })

  it('renders an empty element while the form is valid', () => {
    const html = renderToString(createElement(FormErrorSummary, { errors: {} }))
    expect(html).not.toContain('role="alert"')
  })
})
