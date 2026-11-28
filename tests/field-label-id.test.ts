import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Field } from '../src/components/ui'

describe('Field label association', () => {
  it('points label for at the child own id when provided', () => {
    const html = renderToStaticMarkup(createElement(Field, {
      label: 'What',
      children: createElement('input', { id: 'ct-composer-input', className: 'input' }),
    }))
    expect(html).toContain('<label class="label" for="ct-composer-input">What</label>')
    expect(html).toContain('id="ct-composer-input"')
  })

  it('generates and binds a matching id when the child has none', () => {
    const html = renderToStaticMarkup(createElement(Field, {
      label: 'Display name',
      children: createElement('input', { className: 'input' }),
    }))
    const labelFor = html.match(/<label[^>]*\bfor="([^"]+)"/)?.[1]
    const inputId = html.match(/<input[^>]*\bid="([^"]+)"/)?.[1]
    expect(labelFor).toBeTruthy()
    expect(inputId).toBe(labelFor)
  })
})
