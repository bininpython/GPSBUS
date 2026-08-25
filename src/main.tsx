import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase, type BusLocation } from './lib/supabase'
import './styles.css'

type Role = 'driver' | 'passenger'
type Screen = 'home' | 'auth' | 'map'
type AuthMode = 'signin' | 'signup'

const DRIVER_LOCATION_ID = '00000000-0000-0000-0000-000000000001'

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
        <path d="M97 216v-18m-8 0c0-8 3-15 8-15s8 7 8 15-3 11-8 11m232 7v-18m-8 0c0-8 3-15 8-15s8 7 8 15-3 11-8 11" />
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

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [role, setRole] = useState<Role>('passenger')
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [bus, setBus] = useState<BusLocation | null>(null)
  const [sharing, setSharing] = useState(false)
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const userMarker = useRef<maplibregl.Marker | null>(null)
  const busMarker = useRef<maplibregl.Marker | null>(null)
  const watchId = useRef<number | null>(null)

  useEffect(() => {
    if (screen !== 'map' || !mapContainer.current || map.current) return
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-42.64, -19.58],
      zoom: 13,
      attributionControl: false,
    })
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [screen])

  useEffect(() => {
    if (screen !== 'map') return
    const channel = supabase
      .channel('bus-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_locations' }, payload => {
        const location = payload.new as BusLocation
        setBus(location.is_active ? location : null)
      })
      .subscribe()

    supabase
      .from('bus_locations')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setBus(data))

    return () => { void supabase.removeChannel(channel) }
  }, [screen])

  useEffect(() => {
    const currentMap = map.current
    if (!bus || !currentMap) {
      busMarker.current?.remove()
      busMarker.current = null
      return
    }
    if (!busMarker.current) {
      const marker = document.createElement('div')
      marker.className = 'bus-marker'
      marker.textContent = 'BUS'
      busMarker.current = new maplibregl.Marker({ element: marker })
        .setLngLat([bus.longitude, bus.latitude])
        .addTo(currentMap)
    } else {
      busMarker.current.setLngLat([bus.longitude, bus.latitude])
    }
  }, [bus])

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  async function publishLocation(coords: GeolocationCoordinates, active = true) {
    const { error } = await supabase.from('bus_locations').upsert({
      id: DRIVER_LOCATION_ID,
      route_name: 'Ônibus em operação',
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      is_active: active,
      updated_at: new Date().toISOString(),
    })
    if (error) setMessage('Não foi possível atualizar a localização do ônibus.')
  }

  function showPosition(publish = false) {
    if (!navigator.geolocation) {
      setMessage('Este navegador não oferece suporte ao GPS.')
      return
    }
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const currentMap = map.current
      if (!currentMap) return
      const position: [number, number] = [coords.longitude, coords.latitude]
      currentMap.flyTo({ center: position, zoom: 16 })
      if (!userMarker.current) {
        const marker = document.createElement('div')
        marker.className = 'user-marker'
        userMarker.current = new maplibregl.Marker({ element: marker }).setLngLat(position).addTo(currentMap)
      } else {
        userMarker.current.setLngLat(position)
      }
      if (publish) await publishLocation(coords)
    }, () => setMessage('Permita o acesso à localização para usar o mapa.'), {
      enableHighAccuracy: true,
      timeout: 15000,
    })
  }

  async function toggleSharing() {
    setMessage('')
    if (sharing) {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
      setSharing(false)
      if (bus) {
        await supabase.from('bus_locations').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', DRIVER_LOCATION_ID)
      }
      setBus(null)
      return
    }
    showPosition(true)
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => { void publishLocation(coords) },
      () => setMessage('Não foi possível manter o GPS ativo.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    setSharing(true)
  }

  function selectRole(selectedRole: Role) {
    setRole(selectedRole)
    setAuthMode('signin')
    setMessage('')
    setScreen('auth')
  }

  async function handleAuth(event: React.FormEvent) {
    event.preventDefault()
    setMessage('')
    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { role } } })
      if (error) {
        setMessage(error.message)
        return
      }
      if (data.session) setScreen('map')
      else setMessage('Cadastro realizado. Confirme o e-mail para entrar.')
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage('E-mail ou senha inválidos.')
      return
    }
    const savedRole = data.user.user_metadata?.role as Role | undefined
    if (savedRole && savedRole !== role) {
      await supabase.auth.signOut()
      setMessage(`Esta conta foi cadastrada como ${savedRole === 'driver' ? 'motorista' : 'passageiro'}.`)
      return
    }
    setScreen('map')
  }

  function leaveMap() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setSharing(false)
    setScreen('home')
  }

  if (screen === 'home') {
    return (
      <main className="app-shell home-screen">
        <section className="home-intro">
          <p className="eyebrow">LOCALIZAÇÃO EM TEMPO REAL</p>
          <h1>GPS BUS</h1>
          <p className="subtitle">Rastreamento em tempo real</p>
        </section>

        <BusScene />

        <section className="role-list" aria-label="Escolha como deseja entrar">
          <button className="role-card" onClick={() => selectRole('driver')}>
            <RoleIcon role="driver" />
            <span className="role-copy"><strong>Motorista</strong><small>Compartilhe a localização<br />do ônibus</small></span>
            <span className="chevron"><ChevronIcon /></span>
          </button>
          <button className="role-card" onClick={() => selectRole('passenger')}>
            <RoleIcon role="passenger" />
            <span className="role-copy"><strong>Passageiro</strong><small>Acompanhe o ônibus<br />em tempo real</small></span>
            <span className="chevron"><ChevronIcon /></span>
          </button>
        </section>

        <div className="home-divider"><span /></div>
        <p className="home-description">Motorista compartilha a localização ao vivo.<br />Passageiro acompanha o ônibus e sua própria posição no mapa.</p>
        <footer className="home-footer"><LocationIcon /><span>Tecnologia que conecta.<br />Viagem mais segura.</span></footer>
      </main>
    )
  }

  if (screen === 'auth') {
    return (
      <main className="app-shell auth-screen">
        <header className="screen-header">
          <button className="icon-button" onClick={() => setScreen('home')} aria-label="Voltar"><BackIcon /></button>
          <span className="mini-brand">GPS BUS</span>
          <span className="header-space" />
        </header>

        <section className="auth-intro">
          <RoleIcon role={role} />
          <p className="eyebrow">{role === 'driver' ? 'ÁREA DO MOTORISTA' : 'ÁREA DO PASSAGEIRO'}</p>
          <h1>{authMode === 'signin' ? 'Bem-vindo' : 'Criar conta'}</h1>
          <p>{authMode === 'signin' ? 'Entre para acessar o GPS BUS.' : 'Cadastre-se para continuar com segurança.'}</p>
        </section>

        <form className="auth-card" onSubmit={handleAuth}>
          <label>E-mail<input value={email} type="email" inputMode="email" autoComplete="email" placeholder="voce@exemplo.com" onChange={event => setEmail(event.target.value)} required /></label>
          <label>Senha<input value={password} type="password" minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} placeholder="Mínimo de 6 caracteres" onChange={event => setPassword(event.target.value)} required /></label>
          {message && <p className="form-message" role="status">{message}</p>}
          <button className="primary-button" type="submit">{authMode === 'signin' ? 'Entrar' : 'Criar minha conta'}<ChevronIcon /></button>
        </form>

        <button className="text-button" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setMessage('') }}>
          {authMode === 'signin' ? 'Ainda não tenho uma conta' : 'Já tenho uma conta'}
        </button>
        <p className="secure-copy">Acesso protegido. Não existe modo visitante.</p>
      </main>
    )
  }

  return (
    <main className="app-shell map-screen">
      <div className="map" ref={mapContainer} />
      <header className="map-header floating-panel">
        <button className="icon-button" onClick={leaveMap} aria-label="Voltar"><BackIcon /></button>
        <div><span className="mini-brand">GPS BUS</span><small>Rastreamento em tempo real</small></div>
        <span className="role-pill">{role === 'driver' ? 'MOTORISTA' : 'PASSAGEIRO'}</span>
      </header>

      {message && <p className="map-message" role="status">{message}</p>}

      <section className="map-sheet floating-panel">
        <div className="sheet-handle" />
        <div className="bus-status">
          <span className="bus-status-icon">BUS</span>
          <div><strong>{bus?.route_name || 'Aguardando ônibus'}</strong><small>{bus ? `Localização ativa • precisão ${Math.round(bus.accuracy || 0)} m` : 'Nenhuma localização compartilhada'}</small></div>
          <i className={bus ? 'status-dot online' : 'status-dot'} />
        </div>

        <div className="map-actions">
          {role === 'driver' ? (
            <button className={sharing ? 'danger-button' : 'primary-button'} onClick={() => void toggleSharing()}>
              {sharing ? 'Parar rastreamento' : 'Iniciar rastreamento'}
            </button>
          ) : (
            <button className="primary-button" onClick={() => showPosition()}>Minha localização</button>
          )}
          <button className="secondary-button" disabled={!bus} onClick={() => bus && map.current?.flyTo({ center: [bus.longitude, bus.latitude], zoom: 16 })}>
            <LocationIcon /> Ver ônibus
          </button>
        </div>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
