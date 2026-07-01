import { useEffect, useRef } from 'react'

export default function RichTextEditor({ value, onChange, style = {}, placeholder = '' }) {
  const ref = useRef(null)
  const isInternalChange = useRef(false)

  // Sync external value → DOM (only when value changes from outside)
  useEffect(() => {
    const el = ref.current
    if (!el || isInternalChange.current) return
    if (el.innerHTML !== value) {
      el.innerHTML = value || ''
    }
  }, [value])

  function exec(cmd) {
    ref.current?.focus()
    document.execCommand(cmd, false, null)
    emitChange()
  }

  function insertLink() {
    const url = prompt('Enter URL:', 'https://')
    if (!url) return
    ref.current?.focus()
    document.execCommand('createLink', false, url)
    // Make links open in new tab
    ref.current?.querySelectorAll('a').forEach(a => {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    })
    emitChange()
  }

  function removeLink() {
    ref.current?.focus()
    document.execCommand('unlink', false, null)
    emitChange()
  }

  function emitChange() {
    isInternalChange.current = true
    onChange(ref.current?.innerHTML || '')
    requestAnimationFrame(() => { isInternalChange.current = false })
  }

  function onKeyDown(e) {
    if (e.key === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exec('bold') }
    if (e.key === 'i' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exec('italic') }
    if (e.key === 'u' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exec('underline') }
  }

  const btnStyle = (active) => ({
    background: 'none', border: '1px solid var(--border)', borderRadius: 4,
    color: 'var(--text)', cursor: 'pointer', padding: '2px 8px', fontSize: 12,
    fontWeight: 600, lineHeight: '20px',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 4, padding: '6px 10px',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderBottom: 'none', borderRadius: 'var(--radius) var(--radius) 0 0',
      }}>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('bold') }} style={btnStyle()}><b>B</b></button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('italic') }} style={btnStyle()}><i>I</i></button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('underline') }} style={btnStyle()}><u>U</u></button>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px', alignSelf: 'stretch' }} />
        <button type="button" onMouseDown={e => { e.preventDefault(); insertLink() }} style={btnStyle()} title="Insert link">
          Link
        </button>
        <button type="button" onMouseDown={e => { e.preventDefault(); removeLink() }} style={{ ...btnStyle(), fontSize: 11 }} title="Remove link">
          Unlink
        </button>
        <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6, alignSelf: 'center' }}>
          Ctrl+B · Ctrl+I · Ctrl+U
        </span>
      </div>
      {/* Editor */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onKeyDown={onKeyDown}
        data-placeholder={placeholder}
        style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '0 0 var(--radius) var(--radius)',
          padding: '12px 14px', fontSize: 14, lineHeight: 1.7,
          color: 'var(--text)', outline: 'none', whiteSpace: 'pre-wrap',
          minHeight: 120, flex: 1,
        }}
      />
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: var(--muted);
          pointer-events: none;
        }
        [contenteditable]:focus { border-color: var(--accent); }
        [contenteditable] a { color: var(--accent); text-decoration: underline; }
      `}</style>
    </div>
  )
}

// Converts plain text (with \n) to HTML for initial load
export function plainToHtml(text) {
  if (!text) return ''
  if (text.startsWith('<')) return text  // already HTML
  return text
    .split('\n\n')
    .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

// Converts HTML back to plain text (for contacts that don't need HTML)
export function htmlToPlain(html) {
  if (!html) return ''
  return html
    .replace(/<p>/gi, '').replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<b>(.*?)<\/b>/gi, '$1').replace(/<strong>(.*?)<\/strong>/gi, '$1')
    .replace(/<i>(.*?)<\/i>/gi, '$1').replace(/<em>(.*?)<\/em>/gi, '$1')
    .replace(/<u>(.*?)<\/u>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}
