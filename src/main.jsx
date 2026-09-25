import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

// v4 starts today's record clean and keeps completed days in history.
const STORAGE_KEY = 'telenote-app-state-v4'

const getTodayKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDateLabel = (date = new Date()) => new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(date)
const formatShortDate = (dayKey) => {
  const date = new Date(`${dayKey}T00:00:00`)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
const shiftDateKey = (dayKey, offset) => {
  const date = new Date(`${dayKey}T00:00:00`)
  date.setDate(date.getDate() + offset)
  return getTodayKey(date)
}

const emptyDayState = (dayKey = getTodayKey()) => ({
  dayKey,
  dateLabel: formatDateLabel(new Date(`${dayKey}T00:00:00`)),
  metrics: { calls: 0, connected: 0 },
  resultCounts: { voicemail: 0, blocked: 0, appointment: 0, materials: 0, schedule: 0, callback: 0, noInterest: 0 },
  hourly: { calls: Array(8).fill(0), voicemail: Array(8).fill(0), positive: Array(8).fill(0) },
  followUps: [],
  lastSaved: '--:--',
})

const initialState = {
  ...emptyDayState(),
  history: [],
}

const navItems = [
  { id: 'dashboard', label: '今日の記録', icon: 'chart' },
  { id: 'followups', label: '折り返し対応', icon: 'history' },
  { id: 'history', label: '過去の記録', icon: 'history' },
  { id: 'report', label: '実績レポート', icon: 'bars' },
]

const resultOptions = [
  { value: 'voicemail', label: '留守電', tone: 'gray' },
  { value: 'blocked', label: '着信拒否', tone: 'gray' },
  { value: 'appointment', label: 'アポ決定', tone: 'orange' },
  { value: 'materials', label: '資料請求', tone: 'orange' },
  { value: 'schedule', label: '予定確認', tone: 'orange' },
  { value: 'callback', label: '折り返し', tone: 'blue' },
  { value: 'noInterest', label: '興味なし', tone: 'blue' },
]

const chartLabels = ['9時', '10時', '11時', '12時', '13時', '14時', '15時', '16時']

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const paths = {
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 3-4 3 2 4-6" /></>,
    bars: <><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></>,
    phone: <><path d="M6.7 3.8 9 3.3l2 4.7-1.6 1.5a15 15 0 0 0 5.1 5.1l1.5-1.6 4.7 2-.5 2.3a2 2 0 0 1-2.1 1.6C10.7 18.2 5.8 13.3 5.1 5.9a2 2 0 0 1 1.6-2.1Z" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    arrow: <><path d="m9 18 6-6-6-6" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

function hasActivity(record) {
  return record.metrics.calls > 0 || Object.values(record.resultCounts).some((value) => value > 0)
}

function toHistoryRecord(record) {
  return {
    id: record.dayKey,
    dayKey: record.dayKey,
    dateLabel: record.dateLabel,
    metrics: record.metrics,
    resultCounts: record.resultCounts,
    hourly: record.hourly,
    followUpsCount: record.followUps.length,
  }
}

function rollToNewDay(previous, nextDayKey = getTodayKey()) {
  const archived = hasActivity(previous) ? [toHistoryRecord(previous), ...(previous.history || [])] : (previous.history || [])
  return { ...emptyDayState(nextDayKey), history: archived.slice(0, 366) }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return initialState
    const parsed = JSON.parse(saved)
    if (parsed.dayKey && parsed.dayKey !== getTodayKey()) return rollToNewDay(parsed)
    return { ...initialState, ...parsed, history: parsed.history || [] }
  } catch {
    return initialState
  }
}

function currentTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function appointmentRate(record) {
  return Math.round(((record.resultCounts?.appointment || 0) / Math.max(record.metrics?.calls || 0, 1)) * 1000) / 10
}

function emptyAggregate() {
  return {
    metrics: { calls: 0, connected: 0 },
    resultCounts: Object.fromEntries(resultOptions.map((option) => [option.value, 0])),
    hourly: { calls: Array(8).fill(0), voicemail: Array(8).fill(0), positive: Array(8).fill(0) },
  }
}

function aggregateRecords(records) {
  return records.reduce((aggregate, record) => {
    aggregate.metrics.calls += record.metrics?.calls || 0
    aggregate.metrics.connected += record.metrics?.connected || 0
    resultOptions.forEach((option) => {
      aggregate.resultCounts[option.value] += record.resultCounts?.[option.value] || 0
    })
    ;['calls', 'voicemail', 'positive'].forEach((series) => {
      aggregate.hourly[series] = aggregate.hourly[series].map((value, index) => value + (record.hourly?.[series]?.[index] || 0))
    })
    return aggregate
  }, emptyAggregate())
}

function formatMonthLabel(dayKey) {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(new Date(`${dayKey}T00:00:00`))
}

function StatCard({ label, value, tone }) {
  return <div className={`stat-card ${tone ? `tone-${tone}` : ''}`}>
    <span className="stat-label">{label}</span>
    <strong>{value}</strong>
  </div>
}

function MetricGrid({ metrics, resultCounts }) {
  return <div className="stat-grid">
    <StatCard label="架電件数" value={metrics.calls} />
    <StatCard label="留守電" value={resultCounts.voicemail} tone="gray" />
    <StatCard label="着信拒否" value={resultCounts.blocked} tone="gray" />
    <StatCard label="アポ決定" value={resultCounts.appointment} tone="orange" />
    <StatCard label="資料請求" value={resultCounts.materials} tone="orange" />
    <StatCard label="予定確認" value={resultCounts.schedule} tone="orange" />
    <StatCard label="折り返し" value={resultCounts.callback} tone="blue" />
    <StatCard label="興味なし" value={resultCounts.noInterest} tone="blue" />
  </div>
}

function FlowChart({ hourly }) {
  const width = 760
  const height = 210
  const pad = { left: 36, right: 18, top: 20, bottom: 30 }
  const max = Math.max(30, ...hourly.calls)
  const x = (i) => pad.left + i * ((width - pad.left - pad.right) / (chartLabels.length - 1))
  const y = (value) => pad.top + (max - value) * ((height - pad.top - pad.bottom) / max)
  const series = [
    { key: 'calls', label: '架電件数', color: '#6d4aff', values: hourly.calls },
    { key: 'voicemail', label: '留守電', color: '#a695e8', values: hourly.voicemail },
    { key: 'positive', label: '成果見込み', color: '#c7b9ff', values: hourly.positive },
  ]
  return <div className="chart-wrap">
    <div className="chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
    <svg className="flow-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="時間ごとの架電件数・留守電・成果見込み">
      {[0, 10, 20, 30].map((value) => <g key={value}>
        <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className="chart-grid" />
        <text x={pad.left - 14} y={y(value) + 4} className="chart-axis">{value}</text>
      </g>)}
      {chartLabels.map((label, i) => <g key={label}>
        <line x1={x(i)} x2={x(i)} y1={pad.top} y2={height - pad.bottom} className="chart-grid vertical" />
        <text x={x(i)} y={height - 8} textAnchor="middle" className="chart-axis">{label}</text>
      </g>)}
      <polygon points={`${x(0)},${height - pad.bottom} ${series[2].values.map((value, i) => `${x(i)},${y(value)}`).join(' ')} ${x(series[2].values.length - 1)},${height - pad.bottom}`} className="chart-area" />
      {series.map((item) => <g key={item.key}><polyline points={item.values.map((value, i) => `${x(i)},${y(value)}`).join(' ')} className={`chart-line ${item.key}`} style={{ stroke: item.color }} />{item.values.map((value, i) => <circle key={`${item.key}-${i}`} cx={x(i)} cy={y(value)} r={item.key === 'calls' ? 3.5 : 3} className={`chart-dot ${item.key}`} style={{ fill: item.color }} />)}</g>)}
    </svg>
  </div>
}

function StatusDot({ status }) {
  return <span className={`status-dot ${status === '完了' ? 'done' : status === '今日対応' ? 'today' : ''}`} aria-hidden="true" />
}

function FollowUpTable({ rows, statusFilter, setStatusFilter, onPhone, onMail, onComplete, onUpdateRow }) {
  const [editMode, setEditMode] = useState(false)
  const filters = [
    { label: 'すべて', value: 'すべて' },
    { label: '未対応', value: '未対応' },
    { label: '今日対応', value: '今日対応' },
    { label: '完了', value: '完了' },
  ]
  return <section className="followup-panel">
    <div className="section-heading with-action"><h2>折り返し対応</h2><div className="section-heading-actions"><span className="section-count">{rows.length}件</span><button className={editMode ? 'edit-toggle active' : 'edit-toggle'} onClick={() => setEditMode((current) => !current)}>{editMode ? '編集を終了' : '編集'}</button></div></div>
    <div className="filter-tabs" role="tablist" aria-label="折り返し対応の絞り込み">
      {filters.map((filter) => <button key={filter.value} className={statusFilter === filter.value ? 'filter-tab active' : 'filter-tab'} onClick={() => setStatusFilter(filter.value)}>{filter.label}{filter.value !== 'すべて' && <span>{rows.filter((row) => row.status === filter.value).length}</span>}</button>)}
    </div>
    <div className="followup-table-wrap">
      <table className="followup-table"><thead><tr><th>優先度</th><th>会社名</th><th>担当者</th><th>前回の通話</th><th>次回対応予定</th><th>ステータス</th><th>アクション</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td>{editMode ? <select className="priority-select" aria-label={`${row.company}の優先度`} value={row.priority} onChange={(event) => onUpdateRow(row.id, { priority: event.target.value })}>{['高', '中', '低'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select> : <span className={`priority ${row.priority === '高' ? 'high' : row.priority === '中' ? 'medium' : 'low'}`}>{row.priority}</span>}</td><td className="company-cell">{editMode ? <><input className="edit-input company-input" aria-label={`${row.company}の会社名`} value={row.company} onChange={(event) => onUpdateRow(row.id, { company: event.target.value })} /><small>{row.note}</small></> : <><strong>{row.company}</strong><small>{row.note}</small></>}</td><td>{editMode ? <input className="edit-input person-input" aria-label={`${row.person}の担当者名`} value={row.person} onChange={(event) => onUpdateRow(row.id, { person: event.target.value })} /> : row.person}</td><td>{row.previous}</td><td>{row.next}</td><td><span className="status"><StatusDot status={row.status} />{row.status}</span></td><td><div className="row-actions"><button className="row-button primary" onClick={() => onPhone(row)}><Icon name="phone" size={14} />電話する</button><button className="row-button" onClick={() => onMail(row)}><Icon name="mail" size={14} />メール</button><button className="row-button" onClick={() => onComplete(row)}><Icon name="check" size={14} />完了にする</button></div></td></tr>)}</tbody>
      </table>
      {rows.length === 0 && <div className="empty-state">このステータスの対応はないで。</div>}
    </div>
    <div className="table-footer"><span>1–{rows.length} / {rows.length}件</span><div className="pagination"><button aria-label="前へ"><Icon name="arrow" size={16} /></button><button className="active">1</button><button>2</button><button>3</button><button aria-label="次へ"><Icon name="arrow" size={16} /></button></div></div>
  </section>
}

function ResultPad({ resultCounts, onResult, onDoubleResult, onSlideResult }) {
  const gestureRef = useRef(null)
  const suppressClickRef = useRef(false)
  const suppressClickTimerRef = useRef(null)
  const suppressDoubleClickUntilRef = useRef(0)

  const stopRepeat = () => {
    if (gestureRef.current?.repeatTimer) window.clearInterval(gestureRef.current.repeatTimer)
    if (gestureRef.current) gestureRef.current.repeatTimer = null
  }

  useEffect(() => () => {
    stopRepeat()
    if (suppressClickTimerRef.current) window.clearTimeout(suppressClickTimerRef.current)
  }, [])

  const startSlide = (event, result) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    gestureRef.current = { pointerId: event.pointerId, result, startY: event.clientY, direction: 0, moved: false, repeatTimer: null }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const moveSlide = (event, result) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.result !== result) return
    const distance = gesture.startY - event.clientY
    const direction = Math.abs(distance) >= 22 ? (distance > 0 ? 1 : -1) : 0
    if (!direction || direction === gesture.direction) return
    gesture.direction = direction
    gesture.moved = true
    event.preventDefault()
    onSlideResult(result, direction)
    stopRepeat()
    gesture.repeatTimer = window.setInterval(() => onSlideResult(result, direction), 70)
  }

  const endSlide = (event) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (gesture.moved) {
      suppressClickRef.current = true
      suppressDoubleClickUntilRef.current = Date.now() + 350
      if (suppressClickTimerRef.current) window.clearTimeout(suppressClickTimerRef.current)
      suppressClickTimerRef.current = window.setTimeout(() => { suppressClickRef.current = false }, 500)
    }
    stopRepeat()
    gestureRef.current = null
  }

  const handleClick = (result) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onResult(result)
  }

  const handleDoubleClick = (result) => {
    if (Date.now() < suppressDoubleClickUntilRef.current) return
    onDoubleResult(result)
  }

  return <aside className="quick-log result-pad">
    <div className="section-heading"><h2>架電結果を記録</h2></div>
    <div className="result-buttons">{resultOptions.map((option) => <button key={option.value} className={`result-button ${option.tone}`} onClick={() => handleClick(option.value)} onDoubleClick={() => handleDoubleClick(option.value)} onPointerDown={(event) => startSlide(event, option.value)} onPointerMove={(event) => moveSlide(event, option.value)} onPointerUp={endSlide} onPointerCancel={endSlide} aria-label={`${option.label}を記録。現在${resultCounts[option.value]}件`}><span>{option.label}</span><strong>{resultCounts[option.value]}</strong></button>)}</div>
    <p className="form-hint">1回タップで加算、ダブルタップで1件減算。押したまま上にスライドで高速加算、下にスライドで高速減算。記録内容はこの端末に自動保存されるわ。</p>
  </aside>
}

function AppointmentRateCard({ record, label = '今日のアポイント率', onOpen }) {
  return <button className="appointment-rate-card" onClick={() => onOpen(record)} aria-label={`${label} ${appointmentRate(record)}%。タップで詳細を開く`}>
    <span>{label}</span><strong>{appointmentRate(record)}<small>%</small></strong><em>タップで詳細</em>
  </button>
}

function HistorySection({ history, onOpen }) {
  return <section className="history-panel">
    <div className="section-heading"><div><h2>過去の記録</h2><p className="history-caption">日をまたぐと、その日の記録が自動でここに保存されるで。</p></div><span className="section-count">{history.length}日分</span></div>
    {history.length === 0 ? <div className="history-empty">まだ過去の記録はないで。今日の架電結果は日付が変わるとここに移るわ。</div> : <div className="history-list">{history.map((record) => <button className="history-row" key={record.id} onClick={() => onOpen(record)}><span className="history-date">{record.dateLabel}</span><span className="history-calls">架電 {record.metrics.calls}件</span><span className="history-rate">アポ率 <strong>{appointmentRate(record)}%</strong></span><Icon name="arrow" size={16} /></button>)}</div>}
  </section>
}

function HistoryDetail({ record, onClose }) {
  if (!record) return null
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="detail-modal" role="dialog" aria-modal="true" aria-label={`${record.dateLabel}の記録詳細`} onClick={(event) => event.stopPropagation()}>
      <div className="detail-header"><div><span className="detail-kicker">記録詳細</span><h2>{record.dateLabel}</h2></div><button className="modal-close" onClick={onClose} aria-label="詳細を閉じる"><Icon name="close" size={18} /></button></div>
      <div className="detail-rate"><span>アポイント率</span><strong>{appointmentRate(record)}<small>%</small></strong><p>アポ決定 ÷ 架電件数</p></div>
      <div className="detail-stats"><div><span>架電件数</span><strong>{record.metrics.calls}</strong></div><div><span>出た件数</span><strong>{record.metrics.connected}</strong></div><div><span>折り返し対応</span><strong>{record.resultCounts.callback}</strong></div><div><span>対応待ち</span><strong>{record.followUpsCount || 0}</strong></div></div>
      <h3>結果の内訳</h3><div className="detail-breakdown">{resultOptions.map((option) => <div key={option.value}><span className={`breakdown-dot ${option.tone}`} />{option.label}<strong>{record.resultCounts[option.value] || 0}</strong></div>)}</div>
    </section>
  </div>
}

function Dashboard({ state, onResult, onDoubleResult, onSlideResult, onComplete, onPhone, onMail, onUpdateRow, onJumpToResultPad, onOpenHistory }) {
  const [filter, setFilter] = useState('すべて')
  const [chartDateKey, setChartDateKey] = useState(state.dayKey)
  const filteredRows = useMemo(() => filter === 'すべて' ? state.followUps : state.followUps.filter((row) => row.status === filter), [filter, state.followUps])
  const dateRecords = [state, ...(state.history || [])]
  const chartRecord = dateRecords.find((record) => record.dayKey === chartDateKey) || emptyDayState(chartDateKey)
  const canMoveNewer = chartDateKey < state.dayKey

  useEffect(() => {
    if (chartDateKey > state.dayKey) setChartDateKey(state.dayKey)
  }, [state.dayKey, chartDateKey])

  return <>
    <div className="title-row"><div><h1>{formatShortDate(state.dayKey)} 架電記録</h1><p>{state.dateLabel}</p></div><div className="title-actions"><AppointmentRateCard record={state} onOpen={onOpenHistory} /><button className="primary-button desktop-record" onClick={onJumpToResultPad}><Icon name="plus" size={18} />結果を記録</button></div></div>
    <MetricGrid metrics={state.metrics} resultCounts={state.resultCounts} />
    <section className="flow-panel"><div className="section-heading chart-heading"><div className="date-nav"><button className="date-nav-button previous" onClick={() => setChartDateKey((current) => shiftDateKey(current, -1))} aria-label="前の日付"><Icon name="arrow" size={16} /></button><h2>{formatShortDate(chartRecord.dayKey)} 架電記録</h2><button className="date-nav-button" onClick={() => canMoveNewer && setChartDateKey((current) => shiftDateKey(current, 1))} disabled={!canMoveNewer} aria-label="次の日付"><Icon name="arrow" size={16} /></button></div></div><FlowChart hourly={chartRecord.hourly} /></section>
    <div className="work-grid"><FollowUpTable rows={filteredRows} statusFilter={filter} setStatusFilter={setFilter} onPhone={onPhone} onMail={onMail} onComplete={onComplete} onUpdateRow={onUpdateRow} /><ResultPad resultCounts={state.resultCounts} onResult={onResult} onDoubleResult={onDoubleResult} onSlideResult={onSlideResult} /></div>
    <HistorySection history={state.history} onOpen={onOpenHistory} />
  </>
}

function FollowUpView({ state, onComplete, onPhone, onMail, onUpdateRow }) {
  const [filter, setFilter] = useState('すべて')
  const rows = filter === 'すべて' ? state.followUps : state.followUps.filter((row) => row.status === filter)
  return <div className="standalone-view"><div className="title-row"><div><h1>折り返し対応</h1><p>対応が必要な会社をここでまとめて管理できるで。</p></div><div className="view-note">最終保存 {state.lastSaved}</div></div><FollowUpTable rows={rows} statusFilter={filter} setStatusFilter={setFilter} onPhone={onPhone} onMail={onMail} onComplete={onComplete} onUpdateRow={onUpdateRow} /></div>
}

function HistoryView({ history, onOpen }) {
  return <div className="standalone-view"><div className="title-row"><div><h1>過去の記録</h1><p>日ごとの架電数とアポイント率を振り返れるで。</p></div></div><HistorySection history={history} onOpen={onOpen} /></div>
}

function MonthlyResultGrid({ resultCounts }) {
  return <div className="monthly-result-grid">{resultOptions.map((option) => <div className={`monthly-result ${option.tone}`} key={option.value}><span className="monthly-result-dot" /> <span>{option.label}</span><strong>{resultCounts[option.value] || 0}</strong></div>)}</div>
}

function ReportView({ state }) {
  const currentMonth = state.dayKey.slice(0, 7)
  const monthlyRecords = [state, ...(state.history || [])].filter((record) => record.dayKey?.startsWith(currentMonth))
  const totals = aggregateRecords(monthlyRecords)
  const connectionRate = Math.round((totals.metrics.connected / Math.max(totals.metrics.calls, 1)) * 100)
  const monthLabel = formatMonthLabel(state.dayKey)
  return <div className="standalone-view report-view">
    <div className="title-row"><div><h1>今月の実績</h1><p>{monthLabel}1日〜{formatShortDate(state.dayKey)}の総実績</p></div><div className="view-note">{monthlyRecords.length}日分を集計・自動保存済み</div></div>
    <div className="report-grid"><div className="report-card report-card-featured"><span>架電件数</span><strong>{totals.metrics.calls}</strong><small>今月の総架電数</small></div><div className="report-card"><span>出た件数</span><strong>{totals.metrics.connected}</strong><small>会話につながった件数</small></div><div className="report-card"><span>接続率</span><strong>{connectionRate}%</strong><small>架電したうち、会話できた割合</small></div><div className="report-card"><span>アポイント率</span><strong>{appointmentRate(totals)}%</strong><small>アポ決定 ÷ 架電件数</small></div></div>
    <section className="report-breakdown"><div className="section-heading"><div><h2>今月の結果内訳</h2><p className="report-caption">架電結果ボタンで記録した件数の合計</p></div><span className="section-count">{monthlyRecords.length}日分</span></div><MonthlyResultGrid resultCounts={totals.resultCounts} /></section>
    <section className="flow-panel report-flow"><div className="section-heading"><div><h2>今月の時間帯別集計</h2><p className="report-caption">日ごとの記録を時間帯別に合算</p></div></div><FlowChart hourly={totals.hourly} /></section>
  </div>
}

function App() {
  const [state, setState] = useState(loadState)
  const [activeNav, setActiveNav] = useState('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)
  const pendingResultClick = useRef(null)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }, [state])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const today = getTodayKey()
      setState((previous) => previous.dayKey === today ? previous : rollToNewDay(previous, today))
    }, 30000)
    return () => window.clearInterval(timer)
  }, [])

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2200) }

  const updateResultCount = (result, direction, { notifyUser = true } = {}) => {
    setState((previous) => {
      const current = previous.resultCounts[result] || 0
      if (direction < 0 && current === 0) return previous
      const resultCounts = { ...previous.resultCounts, [result]: Math.max(0, current + direction) }
      const metrics = { ...previous.metrics, calls: Math.max(0, previous.metrics.calls + direction) }
      if (!['voicemail', 'blocked'].includes(result)) metrics.connected = Math.max(0, metrics.connected + direction)
      const hourly = { calls: [...previous.hourly.calls], voicemail: [...previous.hourly.voicemail], positive: [...previous.hourly.positive] }
      hourly.calls[7] = Math.max(0, hourly.calls[7] + direction)
      if (result === 'voicemail') hourly.voicemail[7] = Math.max(0, hourly.voicemail[7] + direction)
      if (['appointment', 'materials', 'schedule'].includes(result)) hourly.positive[7] = Math.max(0, hourly.positive[7] + direction)
      let followUps = previous.followUps
      if (result === 'callback' && direction > 0) followUps = [{ id: Date.now(), priority: '中', company: '新しい折り返し先', person: '担当者様', previous: '9/25 16:42', next: '9/26 10:00', status: '未対応', note: '折り返し内容を確認する。', generated: true }, ...previous.followUps]
      if (result === 'callback' && direction < 0) {
        const generatedIndex = previous.followUps.findIndex((row) => row.generated)
        if (generatedIndex >= 0) followUps = previous.followUps.filter((_, index) => index !== generatedIndex)
      }
      return { ...previous, metrics, resultCounts, hourly, followUps, lastSaved: currentTime() }
    })
    if (notifyUser) notify(direction > 0 ? '架電結果を保存したで' : '直前の結果を1件戻したで')
  }

  const handleResultTap = (result) => {
    if (pendingResultClick.current) {
      if (pendingResultClick.current.result === result) {
        return
      }
      window.clearTimeout(pendingResultClick.current.timer)
      updateResultCount(pendingResultClick.current.result, 1)
    }
    const timer = window.setTimeout(() => {
      pendingResultClick.current = null
      updateResultCount(result, 1)
    }, 260)
    pendingResultClick.current = { result, timer }
  }

  const handleResultDoubleTap = (result) => {
    if (pendingResultClick.current?.result === result) window.clearTimeout(pendingResultClick.current.timer)
    pendingResultClick.current = null
    updateResultCount(result, -1)
  }

  const handleResultSlide = (result, direction) => updateResultCount(result, direction, { notifyUser: false })

  const completeFollowUp = (row) => {
    setState((previous) => ({ ...previous, followUps: previous.followUps.map((item) => item.id === row.id ? { ...item, status: '完了' } : item), lastSaved: currentTime() }))
    notify(`${row.company}を完了にしたで`)
  }

  const updateFollowUpRow = (rowId, changes) => {
    setState((previous) => ({ ...previous, followUps: previous.followUps.map((item) => item.id === rowId ? { ...item, ...changes } : item), lastSaved: currentTime() }))
  }

  const actionToast = (message) => notify(message)
  const openDetail = (record) => setDetailRecord(record)
  const renderView = () => {
    if (activeNav === 'followups') return <FollowUpView state={state} onComplete={completeFollowUp} onPhone={(row) => actionToast(`${row.company}へ電話する準備やで`)} onMail={(row) => actionToast(`${row.company}へのメールを開くで`)} onUpdateRow={updateFollowUpRow} />
    if (activeNav === 'history') return <HistoryView history={state.history} onOpen={openDetail} />
    if (activeNav === 'report') return <ReportView state={state} />
    return <Dashboard state={state} onResult={handleResultTap} onDoubleResult={handleResultDoubleTap} onSlideResult={handleResultSlide} onComplete={completeFollowUp} onPhone={(row) => actionToast(`${row.company}へ電話する準備やで`)} onMail={(row) => actionToast(`${row.company}へのメールを開くで`)} onUpdateRow={updateFollowUpRow} onJumpToResultPad={() => document.querySelector('.result-pad')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} onOpenHistory={openDetail} />
  }

  return <div className="app-shell"><aside className={mobileMenuOpen ? 'sidebar open' : 'sidebar'}><div className="brand">TELENOTE</div><nav>{navItems.map((item) => <button key={item.id} className={activeNav === item.id ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveNav(item.id); setMobileMenuOpen(false) }}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>)}</nav><div className="sidebar-footer"><span className="save-dot" />自動保存オン</div></aside>
    <main className="main-content"><header className="topbar"><button className="mobile-menu" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="メニューを開く"><Icon name="menu" size={22} /></button><div className="mobile-brand">TELENOTE</div><div className="topbar-spacer" /><span className="saved-at">最後に保存した時刻 {state.lastSaved}</span><div className="profile">山田</div></header><div className="content-wrap">{renderView()}</div></main>
    {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}</div>}
    <HistoryDetail record={detailRecord} onClose={() => setDetailRecord(null)} />
  </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
