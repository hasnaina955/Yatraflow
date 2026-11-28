// ============ Home: "Got an invite?" ============
// One field takes a pasted invite link or a typed join code. Join only
// navigates: the existing invite gate (/join/<code>) does the lookup, shows a
// dead link or a failed read for what it is, and asks the person to confirm
// before anything is written. This card writes nothing and reads nothing.
import { useState, type FormEvent } from 'react'
import { Users } from 'lucide-react'
import { Field } from '../ui'
import { readInviteEntry } from '../../lib/inviteEntry'

export function JoinInviteCard({ onNavigate }: { onNavigate: (route: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const verdict = readInviteEntry(value)
    if (verdict.kind === 'error') {
      setError(verdict.message)
      return
    }
    setError(null)
    onNavigate(verdict.route)
  }

  return (
    <form className="nh-join" onSubmit={submit} noValidate aria-labelledby="nh-join-title">
      <p className="nh-join-title" id="nh-join-title">
        <Users size={18} aria-hidden />
        <span>Got an invite?</span>
      </p>
      <Field label="Paste the link or type the join code" error={error ?? undefined}>
        <input
          className="input"
          name="invite-entry"
          value={value}
          placeholder="Invite link or join code"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={event => {
            setValue(event.target.value)
            if (error) setError(null)
          }}
        />
      </Field>
      <button className="btn btn-outline nh-join-submit" type="submit">Join</button>
    </form>
  )
}
