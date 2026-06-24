import { useEffect, useRef, useState } from 'react'
import { ALL_STATION_NAMES, STATION_READINGS } from './data/lines.js'

// カタカナをひらがなに変換し、読み照合を揃える
function toHiragana(str) {
  return str.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  )
}

export default function StationAutocomplete({ id, label, value, onChange, required }) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef(null)

  useEffect(() => {
    setText(value)
  }, [value])

  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const query = text.trim()
  const queryHira = toHiragana(query)
  const matches =
    query === ''
      ? []
      : ALL_STATION_NAMES.filter((name) => {
          if (name.includes(query)) return true
          const reading = STATION_READINGS[name]
          return reading ? reading.includes(queryHira) : false
        }).slice(0, 8)

  function selectStation(name) {
    setText(name)
    onChange(name)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleInputChange(e) {
    const v = e.target.value
    setText(v)
    setOpen(true)
    setActiveIndex(-1)
    onChange(v)
  }

  function handleKeyDown(e) {
    if (!open || matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0) selectStation(matches[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="field autocomplete" ref={containerRef}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required-mark">必須</span>}
      </label>
      <input
        id={id}
        type="text"
        value={text}
        autoComplete="off"
        placeholder="駅名を入力（例：栄）"
        className={required && text.trim() === '' ? 'is-empty' : ''}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && matches.length > 0 && (
        <ul className="autocomplete-list">
          {matches.map((name, idx) => (
            <li
              key={name}
              className={idx === activeIndex ? 'active' : ''}
              onMouseDown={() => selectStation(name)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
