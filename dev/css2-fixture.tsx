import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { ExploreFilterBar } from '../src/components/explore/ExploreFilterBar'
import { SearchField } from '../src/components/filters/SearchField'
import { Select } from '../src/components/Select'
import { DobPicker } from '../src/components/DobPicker'

function Fixture() {
  const [query, setQuery] = useState('')
  const [value, setValue] = useState('one')
  const [budget, setBudget] = useState('')
  const [sort, setSort] = useState('popular')
  const [dob, setDob] = useState('1990-01-01')
  const options = [{ value: 'one', label: 'Any time' }, { value: 'two', label: 'A very long option label for checking truncation in a narrow control' }]
  const page = new URLSearchParams(location.search).get('page')
  document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'
  return <main className={`container ${page === 'trips' ? 'trips-page' : 'ex-page'}`}>
    {page === 'trips' ? <div className="ex-filterbar filterbar-host" role="search" aria-label="Filter your trips">
      <div className="ex-filter-row"><SearchField value={query} onChange={setQuery} label="Search your trips" placeholder="Search places or stops…" shortPlaceholder="Search trips" /></div>
      <div className="ex-filter-row"><div className="ex-select"><Select value={value} onChange={setValue} aria-label="When" options={options} /></div>
        <div className="ex-select"><Select value={value} onChange={setValue} aria-label="Sort by" options={options} /></div></div>
    </div> : <ExploreFilterBar query={query} onQueryChange={setQuery} styles={[]} style="all" onAllStyles={() => {}} onToggleStyle={() => {}}
      savedOnly={false} savedCount={0} onToggleSaved={() => {}} duration={value} onDuration={setValue}
      maxBudget={budget} onBudget={setBudget} sortKey={sort} onSort={setSort} filtersActive={false} onClear={() => {}} />}
    <div style={{ position: 'relative', height: 250, background: 'var(--card)' }}>Content below filters</div>
    <div className="ex-select"><Select value="one" onChange={() => {}} options={options} aria-label="Disabled" disabled /></div>
    <div className="ex-select"><Select value="one" onChange={() => {}} options={options} aria-label="Invalid" aria-invalid /></div>
    <div style={{ margin: '24px', padding: '20px', background: 'var(--card)' }}>
      <DobPicker value={dob} onChange={setDob} max="2026-10-29" />
      <Select compact value={value} onChange={setValue} options={options} aria-label="Compact select" />
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
