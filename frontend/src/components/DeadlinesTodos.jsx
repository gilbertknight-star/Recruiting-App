import { useEffect, useState } from 'react'
import {
  getApplications, createApplication, updateApplication, deleteApplication,
  getTodos, createTodo, updateTodo, deleteTodo,
} from '../api/client'

const STATUSES = ['Not started', 'In progress', 'Submitted', 'Interviewing', 'Offer', 'Rejected']
const STATUS_COLOR = {
  'Not started': '#64748b',
  'In progress': '#60a5fa',
  'Submitted': '#22c55e',
  'Interviewing': '#c084fc',
  'Offer': '#34d399',
  'Rejected': '#ef4444',
}
// Once an application is in, its deadline no longer needs a warning color
const DONE_STATUSES = ['Submitted', 'Interviewing', 'Offer', 'Rejected']

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${dateStr}T00:00:00`)
  return Math.round((due - today) / 86400000)
}

function countdown(dateStr, done) {
  const days = daysUntil(dateStr)
  if (days === null) return { text: 'No deadline', color: 'var(--muted)' }
  const color = done ? 'var(--muted)' : days < 0 ? 'var(--red)' : days <= 3 ? 'var(--red)' : days <= 10 ? 'var(--yellow)' : 'var(--green)'
  const text = days < 0 ? `${-days}d overdue` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`
  return { text, color }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const EMPTY_APP = { firm: '', program: '', deadline: '', link: '' }

export default function DeadlinesTodos() {
  const [apps, setApps] = useState([])
  const [todos, setTodos] = useState([])
  const [newApp, setNewApp] = useState(EMPTY_APP)
  const [addingApp, setAddingApp] = useState(false)
  const [appError, setAppError] = useState('')
  const [newTodo, setNewTodo] = useState('')
  const [newTodoDue, setNewTodoDue] = useState('')
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    getApplications().then(setApps).catch(() => {})
    getTodos().then(setTodos).catch(() => {})
  }, [])

  const sortedApps = [...apps].sort((a, b) => {
    // Open applications first, soonest deadline first; finished ones sink to the bottom
    const doneA = DONE_STATUSES.includes(a.status), doneB = DONE_STATUSES.includes(b.status)
    if (doneA !== doneB) return doneA ? 1 : -1
    return (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1
  })

  async function handleAddApp(e) {
    e.preventDefault()
    if (!newApp.firm.trim()) { setAppError('Enter a firm.'); return }
    setAppError('')
    const created = await createApplication({ ...newApp, firm: newApp.firm.trim(), deadline: newApp.deadline || null })
    setApps(a => [...a, created])
    setNewApp(EMPTY_APP)
    setAddingApp(false)
  }

  async function patchApp(id, updates) {
    setApps(a => a.map(x => x.id === id ? { ...x, ...updates } : x))
    await updateApplication(id, updates)
  }

  async function removeApp(id) {
    setApps(a => a.filter(x => x.id !== id))
    await deleteApplication(id)
  }

  async function handleAddTodo(e) {
    e.preventDefault()
    if (!newTodo.trim()) return
    const created = await createTodo({ text: newTodo.trim(), due: newTodoDue || null })
    setTodos(t => [...t, created])
    setNewTodo('')
    setNewTodoDue('')
  }

  async function toggleTodo(todo) {
    setTodos(t => t.map(x => x.id === todo.id ? { ...x, done: !x.done } : x))
    await updateTodo(todo.id, { done: !todo.done })
  }

  async function removeTodo(id) {
    setTodos(t => t.filter(x => x.id !== id))
    await deleteTodo(id)
  }

  const openTodos = todos.filter(t => !t.done).sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1)
  const doneTodos = todos.filter(t => t.done)
  const urgentCount = apps.filter(a => !DONE_STATUSES.includes(a.status) && daysUntil(a.deadline) !== null && daysUntil(a.deadline) <= 3).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 12 }}>
      {/* Application deadlines */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 12px' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Application Deadlines</span>
            {urgentCount > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>{urgentCount} due within 3 days</span>}
          </div>
          <button className="btn-secondary btn-sm" onClick={() => setAddingApp(v => !v)}>{addingApp ? 'Cancel' : '+ Add application'}</button>
        </div>

        {addingApp && (
          <form onSubmit={handleAddApp} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1fr 1.2fr auto', gap: 8, padding: '0 20px 14px', alignItems: 'start' }}>
            <input autoFocus placeholder="Firm (Evercore)" value={newApp.firm} onChange={e => { setNewApp(a => ({ ...a, firm: e.target.value })); setAppError('') }} />
            <input placeholder="Program (2027 IB Summer Analyst)" value={newApp.program} onChange={e => setNewApp(a => ({ ...a, program: e.target.value }))} />
            <input type="date" value={newApp.deadline} onChange={e => setNewApp(a => ({ ...a, deadline: e.target.value }))} />
            <input placeholder="Application link" value={newApp.link} onChange={e => setNewApp(a => ({ ...a, link: e.target.value }))} />
            <button type="submit" className="btn-primary btn-sm" style={{ height: 34 }}>Add</button>
            {appError && <p style={{ gridColumn: '1 / -1', color: 'var(--red)', fontSize: 12 }}>{appError}</p>}
          </form>
        )}

        {sortedApps.length === 0 ? (
          <p style={{ padding: '4px 20px 20px', color: 'var(--muted)', fontSize: 13 }}>
            Track every bank application here. Add one to see its countdown, and it'll show on your Calendar.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Firm</th>
                <th>Program</th>
                <th>Deadline</th>
                <th>Status</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedApps.map(a => {
                const done = DONE_STATUSES.includes(a.status)
                const cd = countdown(a.deadline, done)
                return (
                  <tr key={a.id} style={{ opacity: a.status === 'Rejected' ? 0.55 : 1 }}>
                    <td style={{ paddingLeft: 20, fontWeight: 500 }}>
                      {a.link ? <a href={a.link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{a.firm}</a> : a.firm}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{a.program}</td>
                    <td>
                      <input
                        type="date"
                        value={a.deadline || ''}
                        onChange={e => patchApp(a.id, { deadline: e.target.value || null })}
                        style={{ width: 130, padding: '3px 6px', fontSize: 12 }}
                      />
                      <div style={{ fontSize: 11, color: cd.color, fontWeight: 600, marginTop: 2 }}>
                        {a.deadline ? `${formatDate(a.deadline)} · ${cd.text}` : cd.text}
                      </div>
                    </td>
                    <td>
                      <select
                        value={a.status}
                        onChange={e => patchApp(a.id, { status: e.target.value })}
                        style={{ width: 128, padding: '3px 6px', fontSize: 12, color: STATUS_COLOR[a.status], fontWeight: 600 }}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <button className="btn-secondary btn-sm" onClick={() => removeApp(a.id)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* To-dos */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>To-do</div>
        <form onSubmit={handleAddTodo} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <input placeholder="Finish Evercore application" value={newTodo} onChange={e => setNewTodo(e.target.value)} style={{ flex: '1 1 180px' }} />
          <input type="date" value={newTodoDue} onChange={e => setNewTodoDue(e.target.value)} style={{ width: 140, flexShrink: 0 }} />
          <button type="submit" className="btn-primary btn-sm" style={{ flexShrink: 0 }}>Add</button>
        </form>

        {openTodos.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing on your list.</p>}
        {openTodos.map(t => {
          const cd = t.due ? countdown(t.due, false) : null
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={false} onChange={() => toggleTodo(t)} />
              <span style={{ flex: 1 }}>{t.text}</span>
              {cd && <span style={{ fontSize: 11, color: cd.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatDate(t.due)} · {cd.text}</span>}
              <button className="btn-secondary btn-sm" onClick={() => removeTodo(t.id)} aria-label="Delete to-do">×</button>
            </div>
          )
        })}

        {doneTodos.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <button className="btn-sm" onClick={() => setShowDone(v => !v)} style={{ background: 'transparent', color: 'var(--muted)', padding: 0 }}>
              {showDone ? 'Hide' : 'Show'} {doneTodos.length} completed
            </button>
            {showDone && doneTodos.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginTop: 6, color: 'var(--muted)' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked onChange={() => toggleTodo(t)} />
                <span style={{ flex: 1, textDecoration: 'line-through' }}>{t.text}</span>
                <button className="btn-secondary btn-sm" onClick={() => removeTodo(t.id)} aria-label="Delete to-do">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
