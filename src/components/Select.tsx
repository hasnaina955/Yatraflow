// ============ Select — the custom listbox behind the A-family work (#107) ============
// Native <select> triggers are themed, but their popups are OS-rendered — on
// Capacitor Android that ships as a stock system dialog (the "still looks
// html" complaint). This is the WAI-ARIA APG select-only combobox, matching
// LocationInput's contract: focus stays on the trigger, the popup is
// aria-activedescendant-driven, Esc / outside-click / Tab dismiss it.
//
// Not every native select is worth replacing — low-traffic ones keep the
// native control (the trigger look is identical; only the popup differs).
// The swapped sites are the high-traffic editing/filtering surfaces.
//
// `Field` clones custom controls with id / aria-describedby / aria-invalid —
// all three land on the trigger button, so labels and errors associate the
// same way they do for `.input` (the PayerSelect lesson, batch 1).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { moveActive, typeaheadIndex, type ListboxMove } from '../lib/listbox'

export interface SelectOption {
  value: string
  label: string
  /** Optional leading node (icon/dot) shown in the popup and on the trigger. */
  icon?: ReactNode
}

interface Props {
  value: string
  onChange: (v: string) => void
  options: readonly SelectOption[]
  disabled?: boolean
  /** Inline-row variant (travel panel halt fields) — auto width, smaller. */
  compact?: boolean
  /** Shown on the trigger when `value` matches no option (or is empty). */
  placeholder?: string
  id?: string
  /** Ref to the trigger button — lets parents keep their focus-on-error wiring. */
  buttonRef?: (el: HTMLButtonElement | null) => void
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-label'?: string
}

export function Select({ value, onChange, options, disabled, compact, placeholder, id, buttonRef, 'aria-describedby': describedby, 'aria-invalid': invalid, 'aria-label': ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef<{ buffer: string; at: number }>({ buffer: '', at: 0 })
  const listId = useId()

  const current = options.find(o => o.value === value)
  const label = current?.label ?? placeholder ?? value

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Opening highlights the committed value; while open, keep the highlighted
  // option visible as the arrows move (focus never leaves the trigger).
  useEffect(() => {
    if (!open) return
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, listId])

  function openPopup() {
    if (disabled || open || options.length === 0) return
    const i = options.findIndex(o => o.value === value)
    setActive(i === -1 ? 0 : i)
    setOpen(true)
  }

  function commit(v: string) {
    onChange(v)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Tab') { setOpen(false); return }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openPopup()
      }
      return
    }
    if (e.key === 'Escape') {
      // Stop the propagation so a surface dialog (StopEditor in Modal) doesn't
      // close the whole sheet when the user only meant to dismiss the list.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    const moves: Record<string, ListboxMove> = { ArrowDown: 'down', ArrowUp: 'up', Home: 'home', End: 'end' }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      setActive(a => moveActive(options.length, a, move))
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (options[active]) commit(options[active].value)
      return
    }
    // Typeahead: printable characters cycle to the next matching option.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      const buffer = now - typeahead.current.at < 500 ? typeahead.current.buffer + e.key : e.key
      typeahead.current = { buffer, at: now }
      const i = typeaheadIndex(options.map(o => o.label), buffer, active)
      if (i !== -1) { e.preventDefault(); setActive(i) }
    }
  }

  return (
    <div ref={wrapRef} className={`cselect${compact ? ' compact' : ''}`}>
      <button
        type="button"
        id={id}
        ref={buttonRef}
        className={`select cselect-trigger${compact ? ' compact' : ''}`}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-opt-${active}` : undefined}
        aria-describedby={describedby}
        aria-invalid={invalid}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openPopup())}
        onKeyDown={onKeyDown}
      >
        {current?.icon && <span className="cselect-ico" aria-hidden>{current.icon}</span>}
        <span className="cselect-label">{label}</span>
      </button>
      {open && (
        <ul className="cselect-pop popover" role="listbox" id={listId} aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li key={o.value} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listId}-opt-${i}`}
                aria-selected={o.value === value}
                tabIndex={-1}
                className={`cselect-option${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(o.value)}
              >
                {o.icon && <span className="cselect-ico" aria-hidden>{o.icon}</span>}
                <span>{o.label}</span>
                {o.value === value && <Check size={13} aria-hidden className="cselect-check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
