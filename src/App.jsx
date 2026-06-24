import { useState } from 'react'
import { LINES } from './data/lines.js'
import { findRoute } from './utils/route.js'
import StationAutocomplete from './StationAutocomplete.jsx'
import './App.css'

function lineInfo(key) {
  return LINES[key]
}

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  const normalized = ((total % 1440) + 1440) % 1440
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0')
  const mm = String(normalized % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function App() {
  const [origin, setOrigin] = useState('堀田')
  const [destination, setDestination] = useState('浅間町')
  const [departureTime, setDepartureTime] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  function handleSearch() {
    setError('')
    setResult(null)
    if (!origin || !destination) {
      setError('出発駅と到着駅を入力してください')
      return
    }
    if (origin === destination) {
      setError('出発駅と到着駅が同じです')
      return
    }
    const route = findRoute(origin, destination)
    if (!route) {
      setError('経路が見つかりませんでした（駅名を確認してください）')
      return
    }
    setResult(route)
  }

  function handleSwap() {
    setOrigin(destination)
    setDestination(origin)
  }

  const arrivalTime = result && departureTime ? addMinutes(departureTime, result.totalTime) : null

  return (
    <div className="app">
      <header className="app-header">
        <h1>名古屋市営地下鉄 乗り換え案内</h1>
      </header>

      <main className="app-main">
        <section className="search-card">
          <StationAutocomplete id="origin" label="出発駅" value={origin} onChange={setOrigin} />

          <button className="swap-btn" onClick={handleSwap} aria-label="駅を入れ替える">
            ⇅
          </button>

          <StationAutocomplete id="destination" label="到着駅" value={destination} onChange={setDestination} />

          <div className="field">
            <label htmlFor="departure-time">出発時刻（任意）</label>
            <input
              id="departure-time"
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
            />
          </div>

          <button className="search-btn" onClick={handleSearch}>
            検索する
          </button>

          {error && <p className="error-msg">{error}</p>}
        </section>

        {result && (
          <section className="result-card">
            <div className="result-summary">
              <div className="summary-item">
                <span className="summary-label">所要時間</span>
                <span className="summary-value">{result.totalTime}分</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">乗り換え</span>
                <span className="summary-value">{result.transferCount}回</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">運賃</span>
                <span className="summary-value">{result.fare}円</span>
              </div>
            </div>

            {arrivalTime && (
              <div className="arrival-banner">
                {departureTime}発 → 到着予想 <strong>{arrivalTime}</strong>
              </div>
            )}

            <ol className="legs-list">
              {result.legs.map((leg, idx) => {
                const info = lineInfo(leg.line)
                return (
                  <li key={idx} className="leg-item">
                    <div
                      className="leg-line-marker"
                      style={{
                        background: info.color,
                        border: info.borderColor ? `2px solid ${info.borderColor}` : 'none',
                      }}
                    >
                      <span style={{ color: info.textColor }}>{info.name}</span>
                    </div>
                    <div className="leg-body">
                      <div className="leg-row">
                        <span className="dot start" />
                        <span className="leg-station">{leg.boardStation}</span>
                      </div>
                      <div className="leg-track" style={{ borderColor: info.color }}>
                        <span className="leg-time">{leg.time}分</span>
                      </div>
                      <div className="leg-row">
                        <span className="dot end" />
                        <span className="leg-station">{leg.alightStation}</span>
                      </div>
                    </div>
                    {idx < result.legs.length - 1 && (
                      <div className="transfer-note">乗り換え（+3分）</div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <p>※ 駅・所要時間・運賃データは概算のハードコード値です。到着予想時刻は時刻表データではなく所要時間からの簡易計算です</p>
      </footer>
    </div>
  )
}
