import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { driverAuthEmail, isSupabaseConfigured, supabase } from './lib/supabase'
import { distanceInMeters, formatDistance, formatSpeed, toCoordinate } from './lib/location'
import type { BusLocation, BusTrip, Coordinate, DriverProfile, Role, Screen } from './types'
import './styles.css'

const DEFAULT_CENTER: Coordinate = [-42.64, -19.58]
const MAX_ROUTE_POINTS = 3_000
type MapStatus = 'loading' | 'ready' | 'error'

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
}

function BackIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
}

function LocationIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
}

function DriverIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 19c5 3 23 3 28 0M24 13h16l7 5-4 6H21l-4-6 7-5Z" /><circle cx="32" cy="31" r="9" /><path d="M23 38v6m18-6v6M14 58c1-9 8-14 18-14s17 5 18 14M25 50l7 5 7-5" /></svg>
}

function PassengerIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="23" r="11" /><path d="M13 58c1-13 8-20 19-20s18 7 19 20M22 25v-5c0-8 4-13 10-13s10 5 10 13v5" /></svg>
}

function BusScene() {
  return (
    <svg className="bus-scene" viewBox="0 0 420 270" role="img" aria-label="Ônibus sendo localizado em tempo real">
      <g className="scene-light" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 216h376M46 216l-34 34m89-34-56 35m274-35 56 35m-56-35 89 34M210 207v49" />
        <path d="M34 216v-59h27v59m0-92h26v92m0-45h31v45m-9-93h30v93m142 0v-86h35v86m0-57h31v57m0-31h26v31" />
        <path d="M57 93c4-12 23-13 29-2 11-5 24 1 25 12H48c0-5 3-8 9-10Zm271 14c4-12 23-13 29-2 11-5 24 1 25 12h-63c0-5 3-8 9-10Z" />
        <ellipse cx="210" cy="90" rx="42" ry="10" />
      </g>
      <g className="scene-dark" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M210 13c-20 0-36 16-36 36 0 25 36 60 36 60s36-35 36-60c0-20-16-36-36-36Z" fill="currentColor" />
        <circle cx="210" cy="48" r="13" fill="white" stroke="white" strokeWidth="5" />
        <circle cx="210" cy="48" r="7" fill="currentColor" stroke="currentColor" />
        <g strokeWidth="5">
          <path d="M162 199v-57c0-15 11-26 26-26h44c15 0 26 11 26 26v57c0 11-8 19-19 19h-58c-11 0-19-8-19-19Z" />
          <path d="M171 146h78v43h-78zM210 147v42M210 160l-18 26m18-26 18 26M172 198h76" />
          <path d="M181 126h58M154 158v25m112-25v25" />
          <circle cx="180" cy="199" r="5" fill="currentColor" /><circle cx="240" cy="199" r="5" fill="currentColor" />
          <path d="M176 218v10m68-10v10" />
        </g>
      </g>
    </svg>
  )
}

function RoleIcon({ role }: { role: Role }) {
  return <span className="role-icon">{role === 'driver' ? <DriverIcon /> : <PassengerIcon />}</span>
}

function DeveloperCredit({ className = '' }: { className?: string }) {
  return <p className={`developer-credit ${className}`.trim()}>developed by <strong>Abner Lucas</strong></p>
}

function toLatLng(coordinate: Coordinate): L.LatLngTuple {
  return [coordinate[1], coordinate[0]]
}

function getPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    })
  })
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [driverCode, setDriverCode] = useState('')
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null)
  const [activeTrip, setActiveTrip] = useState<BusTrip | null>(null)
  const [routeLocations, setRouteLocations] = useState<BusLocation[]>([])
  const [driverOnline, setDriverOnline] = useState(false)
  const [passengerGpsActive, setPassengerGpsActive] = useState(false)
  const [passengerPosition, setPassengerPosition] = useState<Coordinate | null>(null)
  const [followBus, setFollowBus] = useState(true)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading')
  const [mapAttempt, setMapAttempt] = useState(0)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const routeOutline = useRef<L.Polyline | null>(null)
  const routeLine = useRef<L.Polyline | null>(null)
  const busMarker = useRef<L.Marker | null>(null)
  const passengerMarker = useRef<L.Marker | null>(null)
  const geolocationWatch = useRef<number | null>(null)
  const activeTripRef = useRef<BusTrip | null>(null)
  const lastSentAt = useRef(0)
  const lastSentPosition = useRef<Coordinate | null>(null)

  const latestLocation = routeLocations.length ? routeLocations[routeLocations.length - 1] : null
  const latestCoordinate = latestLocation ? toCoordinate(latestLocation) : null
  const passengerDistance = useMemo(() => {
    if (!passengerPosition || !latestCoordinate) return null
    return distanceInMeters(passengerPosition, latestCoordinate)
  }, [passengerPosition, latestCoordinate])

  useEffect(() => {
    activeTripRef.current = activeTrip
  }, [activeTrip])

  useEffect(() => {
    const isMapScreen = screen === 'driver-map' || screen === 'passenger-map'
    if (!isMapScreen || !mapContainer.current || map.current) return

    const container = mapContainer.current
    let mapInstance: L.Map | null = null
    let destroyed = false
    let mapRendered = false
    let tileErrors = 0
    let loadTimer: number | null = null
    let resizeTimer: number | null = null
    let resizeObserver: ResizeObserver | null = null

    setMapLoaded(false)
    setMapStatus('loading')

    const handleTileLoad = () => {
      if (destroyed || mapRendered) return
      mapRendered = true
      if (loadTimer !== null) window.clearTimeout(loadTimer)
      setMapLoaded(true)
      setMapStatus('ready')
    }

    const handleTileError = (event: L.TileErrorEvent) => {
      if (destroyed || mapRendered) return
      tileErrors += 1
      console.error('Falha ao carregar um bloco do mapa:', event.error)
      if (tileErrors >= 4) setMapStatus('error')
    }

    try {
      mapInstance = L.map(container, {
        center: toLatLng(DEFAULT_CENTER),
        zoom: 13,
        zoomControl: false,
        attributionControl: true,
      })
      map.current = mapInstance
      L.control.zoom({ position: 'bottomright' }).addTo(mapInstance)

      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
        crossOrigin: true,
      })
      tiles.on('tileload', handleTileLoad)
      tiles.on('tileerror', handleTileError)
      tiles.addTo(mapInstance)

      routeOutline.current = L.polyline([], {
        color: '#ffffff',
        weight: 9,
        opacity: .95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapInstance)
      routeLine.current = L.polyline([], {
        color: '#111111',
        weight: 5,
        opacity: .92,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapInstance)

      loadTimer = window.setTimeout(() => {
        if (!mapRendered) setMapStatus('error')
      }, 10_000)
      resizeTimer = window.setTimeout(() => mapInstance?.invalidateSize(), 120)
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => mapInstance?.invalidateSize({ pan: false }))
        resizeObserver.observe(container)
      }
    } catch (error) {
      console.error('Este aparelho não conseguiu iniciar o mapa:', error)
      map.current = null
      setMapStatus('error')
      return
    }

    const handleManualMove = () => {
      if (screen === 'passenger-map') setFollowBus(false)
    }
    mapInstance.on('dragstart', handleManualMove)

    return () => {
      destroyed = true
      if (loadTimer !== null) window.clearTimeout(loadTimer)
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeObserver?.disconnect()
      mapInstance.off('dragstart', handleManualMove)
      mapInstance.remove()
      map.current = null
      routeOutline.current = null
      routeLine.current = null
      busMarker.current = null
      passengerMarker.current = null
      setMapLoaded(false)
    }
  }, [mapAttempt, screen])

  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const coordinates = routeLocations.map(location => toLatLng(toCoordinate(location)))
    routeOutline.current?.setLatLngs(coordinates)
    routeLine.current?.setLatLngs(coordinates)
  }, [mapLoaded, routeLocations])

  useEffect(() => {
    const currentMap = map.current
    if (!currentMap || !latestLocation) {
      busMarker.current?.remove()
      busMarker.current = null
      return
    }
    const coordinate = toCoordinate(latestLocation)
    if (!busMarker.current) {
      busMarker.current = L.marker(toLatLng(coordinate), {
        icon: L.divIcon({ className: 'bus-marker', html: '<span>BUS</span>', iconSize: [52, 52], iconAnchor: [26, 26] }),
      }).addTo(currentMap)
    } else {
      busMarker.current.setLatLng(toLatLng(coordinate))
    }
    if (screen === 'passenger-map' && followBus) currentMap.flyTo(toLatLng(coordinate), currentMap.getZoom(), { duration: .7 })
  }, [latestLocation, followBus, screen])

  useEffect(() => {
    const currentMap = map.current
    if (!currentMap || !passengerPosition) {
      passengerMarker.current?.remove()
      passengerMarker.current = null
      return
    }
    if (!passengerMarker.current) {
      passengerMarker.current = L.marker(toLatLng(passengerPosition), {
        icon: L.divIcon({ className: 'user-marker', iconSize: [20, 20], iconAnchor: [10, 10] }),
      }).addTo(currentMap)
    } else {
      passengerMarker.current.setLatLng(toLatLng(passengerPosition))
    }
  }, [passengerPosition])

  useEffect(() => {
    if (screen !== 'passenger-map' || !isSupabaseConfigured) return
    let cancelled = false

    const loadActiveTrip = async () => {
      const { data: trip, error } = await supabase
        .from('gps_bus_trips')
        .select('*')
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        setMessage('Não foi possível consultar o ônibus agora.')
        return
      }
      setActiveTrip(trip)
      activeTripRef.current = trip
      if (!trip) {
        setRouteLocations([])
        return
      }
      const { data: locations } = await supabase
        .from('gps_bus_locations')
        .select('*')
        .eq('trip_id', trip.id)
        .order('recorded_at', { ascending: false })
        .limit(MAX_ROUTE_POINTS)
      if (!cancelled) setRouteLocations([...(locations || [])].reverse())
    }

    void loadActiveTrip()

    const channel = supabase
      .channel('gps-bus-passenger-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gps_bus_trips' }, payload => {
        const trip = payload.new as BusTrip
        if (trip.status === 'active') {
          if (activeTripRef.current?.id !== trip.id) setRouteLocations([])
          activeTripRef.current = trip
          setActiveTrip(trip)
        } else if (activeTripRef.current?.id === trip.id) {
          activeTripRef.current = null
          setActiveTrip(null)
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_bus_locations' }, payload => {
        const location = payload.new as BusLocation
        if (activeTripRef.current?.id !== location.trip_id) return
        setRouteLocations(previous => [...previous.slice(-(MAX_ROUTE_POINTS - 1)), location])
      })
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [screen])

  useEffect(() => () => {
    if (geolocationWatch.current !== null) navigator.geolocation.clearWatch(geolocationWatch.current)
  }, [])

  function clearGpsWatch() {
    if (geolocationWatch.current !== null) navigator.geolocation.clearWatch(geolocationWatch.current)
    geolocationWatch.current = null
  }

  async function handleDriverLogin(event: React.FormEvent) {
    event.preventDefault()
    setMessage('')
    if (!/^\d{6}$/.test(driverCode)) {
      setMessage('Digite o código completo de 6 dígitos.')
      return
    }
    if (!isSupabaseConfigured || !driverAuthEmail) {
      setMessage('O Supabase do GPS BUS ainda precisa ser conectado.')
      return
    }

    setBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: driverAuthEmail, password: driverCode })
    if (error || !data.user) {
      setBusy(false)
      setMessage('Código incorreto. Verifique e tente novamente.')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('gps_bus_drivers')
      .select('user_id,bus_label,active')
      .eq('user_id', data.user.id)
      .maybeSingle()

    if (profileError || !profile?.active) {
      await supabase.auth.signOut()
      setBusy(false)
      setMessage('Este motorista não está autorizado.')
      return
    }

    const { data: trip } = await supabase
      .from('gps_bus_trips')
      .select('*')
      .eq('driver_id', data.user.id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setDriverProfile(profile)
    setActiveTrip(trip)
    if (trip) {
      const { data: locations } = await supabase
        .from('gps_bus_locations')
        .select('*')
        .eq('trip_id', trip.id)
        .order('recorded_at', { ascending: false })
        .limit(MAX_ROUTE_POINTS)
      setRouteLocations([...(locations || [])].reverse())
    } else {
      setRouteLocations([])
    }
    setBusy(false)
    setScreen('driver-map')
  }

  async function recordDriverPosition(position: GeolocationPosition, trip: BusTrip, driverId: string, force = false) {
    const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude]
    const now = Date.now()
    const moved = lastSentPosition.current ? distanceInMeters(lastSentPosition.current, coordinate) : Number.POSITIVE_INFINITY
    if (!force && now - lastSentAt.current < 2_500 && moved < 3) return

    lastSentAt.current = now
    lastSentPosition.current = coordinate
    const location = {
      trip_id: trip.id,
      driver_id: driverId,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
      recorded_at: new Date(position.timestamp).toISOString(),
    }
    const { data, error } = await supabase.from('gps_bus_locations').insert(location).select('*').single()
    if (error) {
      setMessage('Falha ao enviar o GPS. Verifique sua conexão.')
      return
    }
    setRouteLocations(previous => [...previous.slice(-(MAX_ROUTE_POINTS - 1)), data])
  }

  async function startDriverTrip() {
    if (!driverProfile || !navigator.geolocation) {
      setMessage('O GPS não está disponível neste aparelho.')
      return
    }
    setBusy(true)
    setMessage('Solicitando acesso ao GPS…')
    try {
      const firstPosition = await getPosition()
      let trip = activeTrip
      if (!trip) {
        const { data, error } = await supabase.from('gps_bus_trips').insert({
          driver_id: driverProfile.user_id,
          bus_label: driverProfile.bus_label,
          status: 'active',
        }).select('*').single()
        if (error || !data) throw error || new Error('Trip was not created')
        trip = data
        setActiveTrip(trip)
        setRouteLocations([])
      }

      const currentTrip = trip
      if (!currentTrip) throw new Error('Trip is unavailable')
      await recordDriverPosition(firstPosition, currentTrip, driverProfile.user_id, true)
      clearGpsWatch()
      geolocationWatch.current = navigator.geolocation.watchPosition(
        position => { void recordDriverPosition(position, currentTrip, driverProfile.user_id) },
        () => setMessage('O GPS foi interrompido. Mantenha a tela aberta e permita a localização.'),
        { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
      )
      setDriverOnline(true)
      setMessage('Ônibus ligado. Localização sendo transmitida ao vivo.')
      map.current?.flyTo([firstPosition.coords.latitude, firstPosition.coords.longitude], 17)
    } catch {
      setMessage('Não foi possível iniciar. Permita o GPS e tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function finishDriverTrip() {
    clearGpsWatch()
    setDriverOnline(false)
    if (activeTrip) {
      await supabase.from('gps_bus_trips').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', activeTrip.id)
    }
    setActiveTrip(null)
    setMessage('Viagem encerrada. O ônibus não está mais visível aos passageiros.')
  }

  function togglePassengerGps() {
    setMessage('')
    if (passengerGpsActive) {
      clearGpsWatch()
      setPassengerGpsActive(false)
      setPassengerPosition(null)
      return
    }
    if (!navigator.geolocation) {
      setMessage('O GPS não está disponível neste aparelho.')
      return
    }
    geolocationWatch.current = navigator.geolocation.watchPosition(
      position => {
        const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude]
        setPassengerPosition(coordinate)
        if (!latestCoordinate) map.current?.flyTo(toLatLng(coordinate), 16)
      },
      () => setMessage('Permita o acesso à localização para ver sua posição.'),
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 20_000 },
    )
    setPassengerGpsActive(true)
  }

  async function leaveDriverMap() {
    if (driverOnline) await finishDriverTrip()
    await supabase.auth.signOut()
    setDriverProfile(null)
    setDriverCode('')
    setRouteLocations([])
    setMessage('')
    setScreen('home')
  }

  function leavePassengerMap() {
    clearGpsWatch()
    setPassengerGpsActive(false)
    setPassengerPosition(null)
    setRouteLocations([])
    setActiveTrip(null)
    setMessage('')
    setScreen('home')
  }

  if (screen === 'home') {
    return (
      <main className="app-shell home-screen">
        <section className="home-intro">
          <p className="eyebrow">LOCALIZAÇÃO EM TEMPO REAL</p>
          <h1>GPS BUS</h1>
          <p className="subtitle">Seu ônibus no mapa, ao vivo</p>
        </section>
        <BusScene />
        <section className="role-list" aria-label="Escolha como deseja acessar">
          <button className="role-card" onClick={() => { setMessage(''); setScreen('driver-login') }}>
            <RoleIcon role="driver" />
            <span className="role-copy"><strong>Motorista</strong><small>Entre com seu código<br />e ligue o ônibus</small></span>
            <span className="chevron"><ChevronIcon /></span>
          </button>
          <button className="role-card" onClick={() => { setMessage(''); setScreen('passenger-map') }}>
            <RoleIcon role="passenger" />
            <span className="role-copy"><strong>Passageiro</strong><small>Acesse direto, sem login,<br />e acompanhe o ônibus</small></span>
            <span className="chevron"><ChevronIcon /></span>
          </button>
        </section>
        <div className="home-divider"><span /></div>
        <p className="home-description">Somente a localização do ônibus é compartilhada.<br />A posição do passageiro permanece apenas no próprio aparelho.</p>
        <footer className="home-footer">
          <LocationIcon />
          <span>Mapa gratuito OpenStreetMap.<br />Viagem mais segura.</span>
          <DeveloperCredit />
        </footer>
      </main>
    )
  }

  if (screen === 'driver-login') {
    return (
      <main className="app-shell auth-screen pin-screen">
        <header className="screen-header">
          <button className="icon-button" onClick={() => { setMessage(''); setScreen('home') }} aria-label="Voltar"><BackIcon /></button>
          <span className="mini-brand">GPS BUS</span><span className="header-space" />
        </header>
        <section className="auth-intro">
          <RoleIcon role="driver" />
          <p className="eyebrow">ACESSO DO MOTORISTA</p>
          <h1>Ligar ônibus</h1>
          <p>Digite o código de 6 dígitos para iniciar.</p>
        </section>
        <form className="auth-card pin-card" onSubmit={handleDriverLogin}>
          <label htmlFor="driver-code">Código do motorista</label>
          <input
            id="driver-code"
            className="pin-input"
            value={driverCode}
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="••••••"
            onChange={event => setDriverCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
            required
          />
          {message && <p className="form-message" role="status">{message}</p>}
          <button className="primary-button" type="submit" disabled={busy || driverCode.length !== 6}>
            {busy ? 'Verificando…' : 'Entrar como motorista'}<ChevronIcon />
          </button>
        </form>
        <p className="secure-copy">Código validado com segurança pelo Supabase.<br />Não compartilhe seu código.</p>
        <DeveloperCredit className="auth-credit" />
      </main>
    )
  }

  const isDriver = screen === 'driver-map'
  const busVisible = Boolean(activeTrip && latestLocation)

  return (
    <main className="app-shell map-screen">
      <div className="map" ref={mapContainer} role="region" aria-label="Mapa com a localização do ônibus" />
      {mapStatus === 'loading' && <div className="map-state" role="status"><span className="map-spinner" />Carregando mapa…</div>}
      {mapStatus === 'error' && (
        <div className="map-state map-state-error" role="alert">
          <strong>Não foi possível exibir o mapa.</strong>
          <span>Verifique a conexão e tente novamente.</span>
          <button type="button" onClick={() => setMapAttempt(attempt => attempt + 1)}>Tentar novamente</button>
        </div>
      )}
      <header className="map-header floating-panel">
        <button className="icon-button" onClick={() => { void (isDriver ? leaveDriverMap() : Promise.resolve(leavePassengerMap())) }} aria-label="Voltar"><BackIcon /></button>
        <div><span className="mini-brand">GPS BUS</span><small>{isDriver ? driverProfile?.bus_label || 'Motorista' : 'Acompanhamento ao vivo'}</small></div>
        <span className="role-pill">{isDriver ? 'MOTORISTA' : 'PASSAGEIRO'}</span>
      </header>

      {message && <p className="map-message" role="status">{message}</p>}

      <section className="map-sheet floating-panel">
        <div className="sheet-handle" />
        <div className="bus-status">
          <span className="bus-status-icon">BUS</span>
          <div>
            <strong>{isDriver ? (driverOnline ? 'Ônibus ligado' : activeTrip ? 'Viagem pausada' : 'Ônibus desligado') : (busVisible ? activeTrip?.bus_label : 'Aguardando o ônibus')}</strong>
            <small>{isDriver ? `${formatSpeed(latestLocation?.speed ?? null)} • ${routeLocations.length} pontos no trajeto` : (busVisible ? formatDistance(passengerDistance) : 'Nenhuma viagem ativa agora')}</small>
          </div>
          <i className={isDriver ? (driverOnline ? 'status-dot online' : 'status-dot') : (busVisible ? 'status-dot online' : 'status-dot')} />
        </div>

        {isDriver && driverOnline && <p className="foreground-note">Mantenha esta tela aberta durante a viagem para o GPS continuar transmitindo.</p>}

        <div className="map-actions">
          {isDriver ? (
            <button className={driverOnline ? 'danger-button' : 'primary-button'} disabled={busy} onClick={() => { void (driverOnline ? finishDriverTrip() : startDriverTrip()) }}>
              {driverOnline ? 'Desligar ônibus' : activeTrip ? 'Retomar GPS' : 'Ligar e iniciar viagem'}
            </button>
          ) : (
            <button className={passengerGpsActive ? 'secondary-button active-control' : 'primary-button'} onClick={togglePassengerGps}>
              {passengerGpsActive ? 'Desativar meu GPS' : 'Ativar minha localização'}
            </button>
          )}
          <button
            className="secondary-button"
            disabled={!latestCoordinate}
            onClick={() => {
              if (!latestCoordinate) return
              setFollowBus(true)
              map.current?.flyTo(toLatLng(latestCoordinate), 16)
            }}
          ><LocationIcon /> {isDriver ? 'Centralizar' : followBus ? 'Seguindo ônibus' : 'Ver ônibus'}</button>
        </div>
        <DeveloperCredit className="map-credit" />
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
