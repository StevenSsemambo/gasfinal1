import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase.js'

// ─── Safety rules engine ───────────────────────────────────────────────────
const getRecommendations = (severity, level) => {
  if (severity === 'high') return [
    { icon: '🚨', text: 'EVACUATE the area immediately', urgent: true },
    { icon: '⚡', text: 'Cut all electrical power at the mains', urgent: true },
    { icon: '🚫', text: 'Do NOT operate any switches or appliances', urgent: false },
    { icon: '📞', text: 'Call emergency services immediately', urgent: false },
    { icon: '🪟', text: 'Open windows & doors if safe to do so', urgent: false },
    { icon: '🔥', text: 'Eliminate ALL ignition sources nearby', urgent: false },
  ]
  if (severity === 'low') return [
    { icon: '⚠️',  text: 'Ventilate the area — open windows now', urgent: true },
    { icon: '🔍', text: 'Inspect cylinder valve and pipe connections', urgent: false },
    { icon: '🚭', text: 'No open flames or smoking in the area', urgent: false },
    { icon: '👁️', text: 'Monitor sensor readings closely', urgent: false },
  ]
  if (level < 20) return [
    { icon: '📦', text: 'Cylinder critically low — arrange replacement', urgent: true },
    { icon: '📋', text: 'Log consumption and contact your gas supplier', urgent: false },
  ]
  if (level < 40) return [
    { icon: '📦', text: 'Cylinder below 40% — schedule a refill soon', urgent: false },
    { icon: '📊', text: 'Track usage patterns in the Analytics tab', urgent: false },
  ]
  return [
    { icon: '✅', text: 'System operating normally', urgent: false },
    { icon: '📊', text: 'All sensor readings within safe thresholds', urgent: false },
  ]
}

// ─── Color tokens ──────────────────────────────────────────────────────────
const C = {
  safe:  { main: '#00e5a0', dim: 'rgba(0,229,160,0.12)',   border: 'rgba(0,229,160,0.25)',   glow: '0 0 24px rgba(0,229,160,0.3)' },
  low:   { main: '#ffb020', dim: 'rgba(255,176,32,0.12)',  border: 'rgba(255,176,32,0.25)',  glow: '0 0 24px rgba(255,176,32,0.3)' },
  high:  { main: '#ff4560', dim: 'rgba(255,69,96,0.12)',   border: 'rgba(255,69,96,0.25)',   glow: '0 0 24px rgba(255,69,96,0.4)' },
}
const levelColor = l => l < 20 ? C.high : l < 40 ? C.low : C.safe

const isConfigured = () => !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

// ─── Demo data generator (used when Supabase not configured) ───────────────
let demoIdx = 0
const demoSevs = ['safe','safe','safe','safe','safe','low','safe','safe','high','safe','safe','safe']
const genDemoLevel = prev => Math.max(5, Math.min(100, (prev ?? 72) + (Math.random() - 0.48) * 1.5))

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmtTime = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtDate = d => new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' })
const fmtDateShort = d => new Date(d).toLocaleDateString([], { weekday: 'short' })

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatusDot({ online }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: online ? '#00e5a0' : '#ff4560',
      boxShadow: online ? '0 0 8px #00e5a0' : '0 0 8px #ff4560',
      animation: online ? 'pulseGreen 2s ease infinite' : 'pulseRed 1.5s ease infinite',
      flexShrink: 0,
    }} />
  )
}

function Chip({ label, color, bg, border }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      background: bg || 'rgba(255,255,255,0.06)',
      border: `1px solid ${border || 'rgba(255,255,255,0.1)'}`,
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
      color: color || 'var(--text-2)', letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

function Card({ children, style, accent, glow }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${accent ? accent + '30' : 'var(--border)'}`,
      borderRadius: 'var(--r)',
      padding: '20px',
      boxShadow: glow ? glow : 'var(--shadow)',
      transition: 'box-shadow 0.3s, border-color 0.3s',
      ...style,
    }}>{children}</div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
      color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase',
      marginBottom: 16,
    }}>{children}</div>
  )
}

// ── Circular Arc Gauge ─────────────────────────────────────────────────────
function ArcGauge({ value, color, size = 160 }) {
  const r = size * 0.38, cx = size / 2, cy = size / 2
  const startAngle = -210, endAngle = 30, totalArc = endAngle - startAngle
  const valueArc = (value / 100) * totalArc
  const toRad = a => (a * Math.PI) / 180
  const arcPath = (startA, endA) => {
    const x1 = cx + r * Math.cos(toRad(startA))
    const y1 = cy + r * Math.sin(toRad(startA))
    const x2 = cx + r * Math.cos(toRad(endA))
    const y2 = cy + r * Math.sin(toRad(endA))
    const largeArc = Math.abs(endA - startA) > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      {/* Track */}
      <path d={arcPath(startAngle, endAngle)} fill="none"
        stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.075}
        strokeLinecap="round" />
      {/* Value arc */}
      <path d={arcPath(startAngle, startAngle + valueArc)} fill="none"
        stroke={color} strokeWidth={size * 0.075} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'all 0.8s cubic-bezier(.4,0,.2,1)' }} />
      {/* Center value */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color}
        style={{ fontFamily: "'Syne', sans-serif", fontSize: size * 0.22, fontWeight: 800, transition: 'fill 0.4s' }}>
        {Math.round(value)}%
      </text>
      <text x={cx} y={cy + size * 0.13} textAnchor="middle" fill="var(--text-3)"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: size * 0.075, letterSpacing: '0.1em' }}>
        GAS LEVEL
      </text>
    </svg>
  )
}

// ── Sparkline ──────────────────────────────────────────────────────────────
function Sparkline({ data, color, height = 40 }) {
  if (!data || data.length < 2) return null
  const w = 200, h = height, pad = 4
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad * 2),
    h - pad - ((v - min) / range) * (h - pad * 2)
  ])
  const line = pts.map(p => p.join(',')).join(' ')
  const area = `M${pad},${h} L${pts.map(p => p.join(',')).join(' L')} L${w - pad},${h} Z`
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace('#','')})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Bar Chart ──────────────────────────────────────────────────────────────
function BarChart({ data, color }) {
  if (!data || data.length === 0) return (
    <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      No data yet
    </div>
  )
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{
            width: '100%', borderRadius: '3px 3px 0 0',
            height: `${(d.value / max) * 64}px`, minHeight: d.value > 0 ? 3 : 0,
            background: color,
            boxShadow: d.value > 0 ? `0 0 8px ${color}80` : 'none',
            transition: 'height 0.6s cubic-bezier(.4,0,.2,1)',
            opacity: d.value > 0 ? 1 : 0.15,
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em' }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]               = useState('dashboard')
  const [gasLevel, setGasLevel]     = useState(72)
  const [levelHistory, setLevelHistory] = useState([72])
  const [severity, setSeverity]     = useState('safe')
  const [connected, setConnected]   = useState(false)
  const [lastSeen, setLastSeen]     = useState(new Date())
  const [alarmBanner, setAlarmBanner] = useState(false)
  const [alerts, setAlerts]         = useState([])
  const [totalLeaks, setTotalLeaks] = useState(0)
  const [weeklyLeaks, setWeeklyLeaks] = useState([])
  const [weeklyUsage, setWeeklyUsage] = useState([])
  const [loaded, setLoaded]         = useState(false)
  const [demoMode]                  = useState(!isConfigured())
  const audioCtx  = useRef(null)
  const alarmTimer= useRef(null)

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  // ── Sound alarm ──────────────────────────────────────────────────────────
  const playAlarm = useCallback(() => {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext()
      const ctx = audioCtx.current
      [[880, 0], [660, 0.2], [880, 0.4], [660, 0.6]].forEach(([freq, t]) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sawtooth'; osc.frequency.value = freq
        gain.gain.setValueAtTime(0.18, ctx.currentTime + t)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18)
        osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.2)
      })
    } catch (_) {}
  }, [])

  // ── Handle new leakage event ─────────────────────────────────────────────
  const handleLeakEvent = useCallback((sev, id, ts) => {
    setSeverity(sev)
    setLastSeen(new Date(ts || Date.now()))
    if (sev !== 'safe') {
      const alert = {
        id: id || Date.now(),
        severity: sev,
        time: fmtTime(ts || Date.now()),
        date: fmtDate(ts || Date.now()),
        msg: sev === 'high' ? 'CRITICAL gas leakage detected!' : 'Minor gas leakage detected',
      }
      setAlerts(prev => [alert, ...prev.slice(0, 99)])
      if (sev === 'high') {
        setTotalLeaks(t => t + 1)
        setAlarmBanner(true)
        playAlarm()
        clearInterval(alarmTimer.current)
        alarmTimer.current = setInterval(playAlarm, 2500)
      }
    } else {
      setAlarmBanner(false)
      clearInterval(alarmTimer.current)
    }
  }, [playAlarm])

  // ── Supabase data fetch + realtime ───────────────────────────────────────
  useEffect(() => {
    if (demoMode) {
      // Demo simulation when Supabase not configured
      setTimeout(() => setLoaded(true), 300)
      const DEMO_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
      setWeeklyLeaks(DEMO_DAYS.map((l, i) => ({ label: l, value: [0,2,1,0,3,0,1][i] })))
      setWeeklyUsage(DEMO_DAYS.map((l, i) => ({ label: l, value: [68,65,63,61,58,55,72][i] })))
      setAlerts([
        { id: 1, severity: 'high', time: '10:24:15', date: 'Jun 3', msg: 'CRITICAL gas leakage detected!' },
        { id: 2, severity: 'low',  time: '08:12:03', date: 'Jun 3', msg: 'Minor gas leakage detected' },
        { id: 3, severity: 'low',  time: '22:05:41', date: 'Jun 2', msg: 'Minor gas leakage detected' },
      ])
      setTotalLeaks(7)
      setConnected(false)

      const iv = setInterval(() => {
        setGasLevel(prev => {
          const next = genDemoLevel(prev)
          setLevelHistory(h => [...h.slice(-59), next])
          return next
        })
        const sev = demoSevs[demoIdx++ % demoSevs.length]
        setSeverity(sev)
        setLastSeen(new Date())
        if (sev !== 'safe') {
          const a = { id: Date.now(), severity: sev, time: fmtTime(Date.now()), date: fmtDate(Date.now()),
            msg: sev === 'high' ? 'CRITICAL gas leakage detected!' : 'Minor gas leakage detected' }
          setAlerts(p => [a, ...p.slice(0, 99)])
          if (sev === 'high') { setTotalLeaks(t => t + 1); setAlarmBanner(true); playAlarm(); clearInterval(alarmTimer.current); alarmTimer.current = setInterval(playAlarm, 2500) }
        } else { setAlarmBanner(false); clearInterval(alarmTimer.current) }
      }, 3500)
      return () => { clearInterval(iv); clearInterval(alarmTimer.current) }
    }

    // ── Real Supabase mode ─────────────────────────────────────────────────
    let levelCh, leakCh

    async function init() {
      // Load last 60 gas level readings for sparkline
      const { data: lvls } = await supabase
        .from('gas_levels')
        .select('level_percent, raw_distance_mm, created_at')
        .order('created_at', { ascending: false })
        .limit(60)
      if (lvls && lvls.length > 0) {
        const arr = lvls.map(r => r.level_percent).reverse()
        setGasLevel(arr[arr.length - 1])
        setLevelHistory(arr)
        setLastSeen(new Date(lvls[0].created_at))
        setConnected(true)
      }

      // Load last 100 leakage events
      const { data: leaks } = await supabase
        .from('gas_leakages')
        .select('id, severity, raw_value, ppm_approx, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
      if (leaks && leaks.length > 0) {
        setSeverity(leaks[0].severity)
        const alertList = leaks.map(r => ({
          id: r.id,
          severity: r.severity,
          time: fmtTime(r.created_at),
          date: fmtDate(r.created_at),
          msg: r.severity === 'high' ? 'CRITICAL gas leakage detected!'
             : r.severity === 'low'  ? 'Minor gas leakage detected'
             : 'System reading — safe',
          ppm: r.ppm_approx,
        }))
        setAlerts(alertList)
        setTotalLeaks(leaks.filter(r => r.severity !== 'safe').length)
      }

      // Weekly analytics
      const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data: wLeaks } = await supabase
        .from('gas_leakages')
        .select('severity, created_at')
        .gte('created_at', sevenAgo)
        .neq('severity', 'safe')
      if (wLeaks) {
        const counts = {}; DAYS.forEach(d => counts[d] = 0)
        wLeaks.forEach(r => { const d = DAYS[new Date(r.created_at).getDay()]; counts[d]++ })
        setWeeklyLeaks(DAYS.map(d => ({ label: d.slice(0,3), value: counts[d] })))
      } else {
        setWeeklyLeaks(DAYS.map(d => ({ label: d.slice(0,3), value: 0 })))
      }
      const { data: wLvls } = await supabase
        .from('gas_levels')
        .select('level_percent, created_at')
        .gte('created_at', sevenAgo)
      if (wLvls && wLvls.length > 0) {
        const sums = {}, cnts = {}; DAYS.forEach(d => { sums[d] = 0; cnts[d] = 0 })
        wLvls.forEach(r => { const d = DAYS[new Date(r.created_at).getDay()]; sums[d] += r.level_percent; cnts[d]++ })
        setWeeklyUsage(DAYS.map(d => ({ label: d.slice(0,3), value: cnts[d] > 0 ? Math.round(sums[d] / cnts[d]) : 0 })))
      } else {
        setWeeklyUsage(DAYS.map(d => ({ label: d.slice(0,3), value: 0 })))
      }

      setLoaded(true)
    }

    init()

    // Realtime: gas levels
    levelCh = supabase.channel('rt-levels')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gas_levels' }, payload => {
        const lvl = payload.new.level_percent
        setGasLevel(lvl)
        setLevelHistory(h => [...h.slice(-59), lvl])
        setLastSeen(new Date(payload.new.created_at))
        setConnected(true)
      })
      .subscribe()

    // Realtime: leakages
    leakCh = supabase.channel('rt-leakages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gas_leakages' }, payload => {
        handleLeakEvent(payload.new.severity, payload.new.id, payload.new.created_at)
        setConnected(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(levelCh)
      supabase.removeChannel(leakCh)
      clearInterval(alarmTimer.current)
    }
  }, [demoMode, handleLeakEvent, playAlarm])

  // ── Derived ──────────────────────────────────────────────────────────────
  const sCol   = C[severity]
  const lCol   = levelColor(gasLevel)
  const rules  = getRecommendations(severity, gasLevel)
  const estDays = Math.max(0, Math.ceil(gasLevel / 2.1))
  const nonSafeAlerts = alerts.filter(a => a.severity !== 'safe')

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '◈' },
    { id: 'alerts',    label: 'Alerts',    icon: '◉', badge: nonSafeAlerts.length },
    { id: 'analytics', label: 'Analytics', icon: '◎' },
    { id: 'device',    label: 'Device',    icon: '◇' },
  ]

  if (!loaded) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 40, height: 40, border: '2px solid var(--border2)', borderTopColor: '#00e5a0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.1em' }}>INITIALISING</span>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 20px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #ff6b35, #ff4560)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, boxShadow: '0 0 16px rgba(255,69,96,0.4)',
          }}>🔥</div>
          <div>
            <div style={{ fontFamily: 'var(--font-disp)', fontSize: 17, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
              GasWatch <span style={{ color: '#4d8eff' }}>Pro</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.12em' }}>
              {demoMode ? 'DEMO MODE' : 'LIVE · IOT MONITORING'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            {lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <StatusDot online={connected} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: connected ? '#00e5a0' : '#ff4560' }}>
              {connected ? 'ONLINE' : demoMode ? 'DEMO' : 'OFFLINE'}
            </span>
          </div>
          <Chip label={severity.toUpperCase()} color={sCol.main} border={sCol.border} bg={sCol.dim} />
        </div>
      </header>

      {/* ── ALARM BANNER ────────────────────────────────────────────── */}
      {alarmBanner && (
        <div style={{
          position: 'sticky', top: 56, zIndex: 190,
          background: 'rgba(255,69,96,0.12)', borderBottom: '1px solid rgba(255,69,96,0.3)',
          padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          animation: 'shimmer 0.8s ease infinite',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>🚨</span>
            <div>
              <div style={{ fontFamily: 'var(--font-disp)', fontWeight: 700, color: '#ff4560', fontSize: 14, letterSpacing: '-0.01em' }}>
                CRITICAL GAS LEAKAGE DETECTED
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,69,96,0.8)', marginTop: 2 }}>
                Evacuate immediately · Cut power · Call emergency services
              </div>
            </div>
          </div>
          <button onClick={() => { setAlarmBanner(false); clearInterval(alarmTimer.current) }}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: '#ff4560', color: '#fff', fontFamily: 'var(--font-body)',
              boxShadow: '0 0 16px rgba(255,69,96,0.4)',
            }}>Dismiss</button>
        </div>
      )}

      {/* ── NAV TABS ────────────────────────────────────────────────── */}
      <nav style={{
        background: 'rgba(10,14,26,0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', padding: '0 12px', overflowX: 'auto', gap: 0,
        WebkitOverflowScrolling: 'touch',
      }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{
            padding: '14px 18px', fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font-body)', letterSpacing: '0.01em',
            color: tab === n.id ? '#f0f4ff' : 'var(--text-3)',
            borderBottom: `2px solid ${tab === n.id ? '#4d8eff' : 'transparent'}`,
            borderRadius: 0, whiteSpace: 'nowrap',
            transition: 'color 0.2s', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>{n.icon}</span>
            {n.label}
            {n.badge > 0 && (
              <span style={{
                background: '#ff4560', color: '#fff', fontSize: 9, fontWeight: 700,
                borderRadius: 10, padding: '1px 5px', fontFamily: 'var(--font-mono)',
              }}>{n.badge > 99 ? '99+' : n.badge}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ── PAGE CONTENT ────────────────────────────────────────────── */}
      <main style={{ padding: '20px', maxWidth: 960, margin: '0 auto' }} className="fade-up">

        {/* ════════════ DASHBOARD ════════════ */}
        {tab === 'dashboard' && (
          <>
            {/* Top row: gauge + leakage status + quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>

              {/* Cylinder Level */}
              <Card accent={lCol.main} glow={lCol.glow} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <SectionTitle>Cylinder Level · DYP-L06</SectionTitle>
                <ArcGauge value={gasLevel} color={lCol.main} size={160} />
                <div style={{ marginTop: 12, textAlign: 'center', width: '100%' }}>
                  <Chip
                    label={gasLevel < 20 ? '⚠ Replace Now' : gasLevel < 40 ? '⚠ Plan Refill' : '✓ Sufficient'}
                    color={lCol.main} border={lCol.border} bg={lCol.dim}
                  />
                  <div style={{ marginTop: 12 }}>
                    <Sparkline data={levelHistory} color={lCol.main} height={44} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginTop: 4, letterSpacing: '0.08em' }}>
                    LAST {Math.min(levelHistory.length, 60)} READINGS
                  </div>
                </div>
              </Card>

              {/* Leakage Status */}
              <Card accent={sCol.main} glow={severity !== 'safe' ? sCol.glow : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <SectionTitle>Leakage Status · MQ6</SectionTitle>
                <div style={{
                  width: 88, height: 88, borderRadius: '50%',
                  background: sCol.dim, border: `1.5px solid ${sCol.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 38, boxShadow: severity !== 'safe' ? sCol.glow : undefined,
                  animation: severity === 'high' ? 'pulseRed 1.2s ease infinite' : severity === 'safe' ? 'pulseGreen 3s ease infinite' : undefined,
                }}>
                  {severity === 'high' ? '🚨' : severity === 'low' ? '⚠️' : '✅'}
                </div>
                <div style={{ fontFamily: 'var(--font-disp)', fontSize: 24, fontWeight: 800, color: sCol.main, letterSpacing: '-0.02em' }}>
                  {severity === 'high' ? 'CRITICAL' : severity === 'low' ? 'LOW LEAK' : 'ALL SAFE'}
                </div>
                <Chip label={severity.toUpperCase()} color={sCol.main} border={sCol.border} bg={sCol.dim} />
              </Card>

              {/* Quick Stats */}
              <Card>
                <SectionTitle>Quick Stats</SectionTitle>
                {[
                  { label: 'Current Level',     val: `${Math.round(gasLevel)}%`,  col: lCol.main },
                  { label: 'Est. Days Left',     val: `~${estDays}d`,              col: '#4d8eff' },
                  { label: 'Total Leak Events',  val: totalLeaks,                  col: '#ff4560' },
                  { label: 'Avg Daily Use',      val: '~2.1%/day',                 col: '#00e5a0' },
                ].map((s, i, arr) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-2)' }}>{s.label}</span>
                    <span style={{ fontFamily: 'var(--font-disp)', fontSize: 20, fontWeight: 800, color: s.col }}>{s.val}</span>
                  </div>
                ))}
              </Card>
            </div>

            {/* Safety Recommendations */}
            <Card accent={sCol.main}>
              <SectionTitle>⚡ Safety Recommendations</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {rules.map((r, i) => (
                  <div key={i} style={{
                    padding: '12px 14px', borderRadius: 'var(--r-sm)',
                    background: r.urgent ? sCol.dim : 'var(--surface2)',
                    border: `1px solid ${r.urgent ? sCol.border : 'var(--border)'}`,
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: '1.5',
                      color: r.urgent ? sCol.main : 'var(--text-2)',
                      fontWeight: r.urgent ? 600 : 400,
                    }}>{r.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* ════════════ ALERTS ════════════ */}
        {tab === 'alerts' && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <SectionTitle>Alert History</SectionTitle>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                  {nonSafeAlerts.length} leak event{nonSafeAlerts.length !== 1 ? 's' : ''} recorded
                </div>
              </div>
              <button onClick={() => setAlerts([])} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text-2)', fontFamily: 'var(--font-body)',
              }}>Clear All</button>
            </div>

            {nonSafeAlerts.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🛡️</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>No leakage events recorded</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 4 }}>All readings are safe</div>
              </div>
            )}

            {nonSafeAlerts.map(a => {
              const ac = C[a.severity]
              return (
                <div key={a.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 16px', borderRadius: 'var(--r-sm)', marginBottom: 8,
                  background: ac.dim, border: `1px solid ${ac.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>{a.severity === 'high' ? '🚨' : '⚠️'}</span>
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: ac.main }}>
                        {a.msg}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                        {a.date} · {a.time}{a.ppm ? ` · ~${a.ppm} ppm` : ''}
                      </div>
                    </div>
                  </div>
                  <Chip label={a.severity.toUpperCase()} color={ac.main} border={ac.border} bg={ac.dim} />
                </div>
              )
            })}
          </Card>
        )}

        {/* ════════════ ANALYTICS ════════════ */}
        {tab === 'analytics' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16, marginBottom: 16 }}>
              <Card>
                <SectionTitle>Weekly Gas Usage (avg %)</SectionTitle>
                <BarChart data={weeklyUsage} color="#4d8eff" />
                <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                  Est. {estDays} days remaining at current rate
                </div>
              </Card>
              <Card>
                <SectionTitle>Weekly Leak Events</SectionTitle>
                <BarChart data={weeklyLeaks} color="#ff4560" />
                <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                  {weeklyLeaks.reduce((s, d) => s + d.value, 0)} total this week
                </div>
              </Card>
            </div>

            {/* Summary stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Avg Daily Use',     val: '~2.1%',                                  col: '#4d8eff' },
                { label: 'Cylinder Lifespan', val: `~${estDays}d`,                            col: '#00e5a0' },
                { label: 'Leak Rate',         val: `${(totalLeaks / 7).toFixed(1)}/day`,      col: '#ffb020' },
                { label: 'Total Leaks',       val: totalLeaks,                                col: '#ff4560' },
              ].map((s, i) => (
                <Card key={i} accent={s.col} style={{ textAlign: 'center', padding: '18px 16px' }}>
                  <div style={{ fontFamily: 'var(--font-disp)', fontSize: 32, fontWeight: 800, color: s.col, lineHeight: 1 }}>
                    {s.val}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {s.label}
                  </div>
                </Card>
              ))}
            </div>

            {/* Level trend */}
            <Card>
              <SectionTitle>Gas Level Trend (Last {Math.min(levelHistory.length, 60)} Readings)</SectionTitle>
              <div style={{ height: 80 }}>
                <Sparkline data={levelHistory} color="#4d8eff" height={80} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                <span>oldest</span>
                <span>current: {Math.round(gasLevel)}%</span>
              </div>
            </Card>
          </>
        )}

        {/* ════════════ DEVICE ════════════ */}
        {tab === 'device' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
              <Card accent="#4d8eff">
                <SectionTitle>ESP32 Status</SectionTitle>
                {[
                  { k: 'Connection',  v: connected ? 'Online' : demoMode ? 'Demo Mode' : 'Offline', col: connected ? '#00e5a0' : demoMode ? '#ffb020' : '#ff4560' },
                  { k: 'Last Data',   v: lastSeen.toLocaleTimeString(), col: null },
                  { k: 'Protocol',    v: 'HTTP POST → Supabase', col: null },
                  { k: 'Send Rate',   v: 'Every 5 seconds', col: null },
                  { k: 'Firmware',    v: 'GasWatch v1.0.0', col: '#4d8eff' },
                  { k: 'Data Tables', v: 'gas_levels · gas_leakages', col: null },
                ].map((r, i, arr) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-3)' }}>{r.k}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: r.col || 'var(--text-2)' }}>{r.v}</span>
                  </div>
                ))}
              </Card>

              <Card>
                <SectionTitle>Sensor Health</SectionTitle>
                {[
                  { name: 'MQ6 Gas Sensor',     type: 'Leakage Detection',  health: connected ? 98  : 0, col: '#00e5a0' },
                  { name: 'DYP-L06 Ultrasonic', type: 'Gas Level (UART)',   health: connected ? 100 : 0, col: '#4d8eff' },
                ].map((s, i) => (
                  <div key={i} style={{
                    padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)', marginBottom: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{s.name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.type}</div>
                      </div>
                      <Chip label={connected ? 'ACTIVE' : 'OFFLINE'} color={connected ? '#00e5a0' : '#ff4560'} />
                    </div>
                    <div style={{ background: 'var(--surface3)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${s.health}%`, height: '100%', background: s.col, borderRadius: 4, boxShadow: `0 0 8px ${s.col}80`, transition: 'width 1s ease' }} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'right', marginTop: 4 }}>{s.health}% health</div>
                  </div>
                ))}
              </Card>
            </div>

            <Card>
              <SectionTitle>Integration Setup</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {[
                  { icon: '🔗', title: 'ESP32 WiFi', desc: 'Set WIFI_SSID + WIFI_PASSWORD in firmware. ESP32 connects to your local network.' },
                  { icon: '🗄️', title: 'Supabase', desc: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file before deploying.' },
                  { icon: '📊', title: 'Tables', desc: 'ESP32 POSTs to gas_levels (level_percent) and gas_leakages (severity, ppm_approx).' },
                  { icon: '📡', title: 'Realtime', desc: 'Enable Realtime on both tables in Supabase Dashboard → Database → Replication.' },
                ].map((c, i) => (
                  <div key={i} style={{
                    padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)', display: 'flex', gap: 12,
                  }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{c.icon}</span>
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{c.title}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{c.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </main>

      {/* ── MOBILE BOTTOM NAV ───────────────────────────────────────── */}
      <div style={{
        display: 'none',
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--border)',
        padding: '6px 0 max(6px, env(safe-area-inset-bottom))', zIndex: 200,
      }} id="mobile-nav">
        {navItems.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '6px 4px', position: 'relative',
            color: tab === n.id ? '#f0f4ff' : 'var(--text-3)',
          }}>
            <span style={{ fontSize: 18 }}>{n.icon}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em' }}>{n.label}</span>
            {n.badge > 0 && (
              <span style={{
                position: 'absolute', top: 2, right: '18%',
                background: '#ff4560', color: '#fff', fontSize: 8, fontWeight: 700,
                borderRadius: 8, padding: '0 4px', fontFamily: 'var(--font-mono)',
              }}>{n.badge}</span>
            )}
          </button>
        ))}
      </div>

      <style>{`
        @media (max-width: 640px) {
          #mobile-nav { display: flex !important; }
          body { padding-bottom: 70px; }
        }
      `}</style>
    </div>
  )
}
