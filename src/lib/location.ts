import type { BusLocation, Coordinate } from '../types'
import type { StyleSpecification } from 'maplibre-gl'

export const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'

export const FALLBACK_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'openstreetmap-raster': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'openstreetmap-raster',
      type: 'raster',
      source: 'openstreetmap-raster',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
}

export function toCoordinate(location: BusLocation): Coordinate {
  return [location.longitude, location.latitude]
}

export function distanceInMeters(from: Coordinate, to: Coordinate) {
  const earthRadius = 6_371_000
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = toRadians(to[1] - from[1])
  const longitudeDelta = toRadians(to[0] - from[0])
  const latitude1 = toRadians(from[1])
  const latitude2 = toRadians(to[1])
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(meters: number | null) {
  if (meters === null) return 'Ative sua localização para calcular a distância'
  if (meters < 1_000) return `${Math.round(meters)} m de você`
  return `${(meters / 1_000).toFixed(1).replace('.', ',')} km de você`
}

export function formatSpeed(metersPerSecond: number | null) {
  if (metersPerSecond === null || metersPerSecond < 0) return '0 km/h'
  return `${Math.round(metersPerSecond * 3.6)} km/h`
}
