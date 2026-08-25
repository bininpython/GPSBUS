export type Role = 'driver' | 'passenger'
export type Screen = 'home' | 'driver-login' | 'driver-map' | 'passenger-map'

export type DriverProfile = {
  user_id: string
  bus_label: string
  active: boolean
}

export type BusTrip = {
  id: string
  driver_id: string
  bus_label: string
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
}

export type BusLocation = {
  id: number
  trip_id: string
  driver_id: string
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  recorded_at: string
}

export type Coordinate = [longitude: number, latitude: number]
