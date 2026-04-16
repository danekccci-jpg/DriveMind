// NUCLEAR DEBUG: avoid importing react-native-maps in this build.
type MapStyleElement = Record<string, unknown>

// ── Light style — clean, minimal POI ────────────────────────────────────────

export const MAP_STYLE_LIGHT: MapStyleElement[] = [
  { featureType: 'all',                 elementType: 'geometry.fill',    stylers: [{ color: '#f0f0f0' }] },
  { featureType: 'all',                 elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
  { featureType: 'poi',                 elementType: 'all',              stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park',            elementType: 'geometry.fill',    stylers: [{ color: '#c8e6c9' }, { visibility: 'on' }] },
  { featureType: 'road',                elementType: 'geometry',         stylers: [{ color: '#ffffff' }] },
  { featureType: 'road',                elementType: 'geometry.stroke',  stylers: [{ color: '#d6d6d6' }] },
  { featureType: 'road.highway',        elementType: 'geometry',         stylers: [{ color: '#f5c842' }] },
  { featureType: 'road.highway',        elementType: 'geometry.stroke',  stylers: [{ color: '#e0a800' }] },
  { featureType: 'road.arterial',       elementType: 'geometry',         stylers: [{ color: '#ffffff' }] },
  { featureType: 'transit',             elementType: 'all',              stylers: [{ visibility: 'off' }] },
  { featureType: 'water',               elementType: 'geometry',         stylers: [{ color: '#b3d9f5' }] },
  { featureType: 'landscape',           elementType: 'geometry',         stylers: [{ color: '#e8e8e8' }] },
  { featureType: 'administrative',      elementType: 'geometry.stroke',  stylers: [{ color: '#c0c0c0' }] },
  { featureType: 'administrative',      elementType: 'labels.text.fill', stylers: [{ color: '#6c6c6c' }] },
]

// ── Modern Dark style — premium 2026 navigation look ────────────────────────
//
// Design principles:
//  • Near-black base (#0d1117) with dark grey roads — high contrast for the
//    neon route polyline without washing out traffic colours.
//  • Highways get a mid-grey fill so they are instantly readable at speed.
//  • All POI, transit, business labels are hidden to reduce visual noise.
//  • Water uses deep navy (#0a1628) and parks use very dark green (#1a2e1a).
//  • Administrative boundaries kept as faint strokes to orient the driver.

export const MAP_STYLE_DARK: MapStyleElement[] = [
  // ── Base ──
  { featureType: 'all',                    elementType: 'geometry',             stylers: [{ color: '#0d1117' }] },
  { featureType: 'all',                    elementType: 'labels.text.fill',     stylers: [{ color: '#8a9bbf' }] },
  { featureType: 'all',                    elementType: 'labels.text.stroke',   stylers: [{ color: '#0d1117' }] },
  { featureType: 'all',                    elementType: 'labels.icon',          stylers: [{ visibility: 'off' }] },

  // ── Roads ──
  { featureType: 'road',                   elementType: 'geometry',             stylers: [{ color: '#1e2433' }] },
  { featureType: 'road',                   elementType: 'geometry.stroke',      stylers: [{ color: '#111827' }] },
  { featureType: 'road',                   elementType: 'labels.text.fill',     stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road',                   elementType: 'labels.text.stroke',   stylers: [{ color: '#111827' }] },
  { featureType: 'road.highway',           elementType: 'geometry',             stylers: [{ color: '#2d3a50' }] },
  { featureType: 'road.highway',           elementType: 'geometry.stroke',      stylers: [{ color: '#1a2238' }] },
  { featureType: 'road.highway',           elementType: 'labels.text.fill',     stylers: [{ color: '#c0cfe8' }] },
  { featureType: 'road.highway',           elementType: 'labels.text.stroke',   stylers: [{ color: '#0d1117' }] },
  { featureType: 'road.arterial',          elementType: 'geometry',             stylers: [{ color: '#1a2030' }] },
  { featureType: 'road.arterial',          elementType: 'labels.text.fill',     stylers: [{ color: '#7a8aa8' }] },
  { featureType: 'road.local',             elementType: 'geometry',             stylers: [{ color: '#16202e' }] },
  { featureType: 'road.local',             elementType: 'labels.text.fill',     stylers: [{ color: '#5a6a80' }] },

  // ── POI — all hidden ──
  { featureType: 'poi',                    elementType: 'all',                  stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business',           elementType: 'all',                  stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government',         elementType: 'all',                  stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical',            elementType: 'all',                  stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship',   elementType: 'all',                  stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school',             elementType: 'all',                  stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex',     elementType: 'all',                  stylers: [{ visibility: 'off' }] },
  // Parks stay but very muted
  { featureType: 'poi.park',               elementType: 'geometry',             stylers: [{ color: '#111d11' }] },
  { featureType: 'poi.park',               elementType: 'labels',               stylers: [{ visibility: 'off' }] },

  // ── Transit — hidden ──
  { featureType: 'transit',               elementType: 'all',                   stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station',       elementType: 'all',                   stylers: [{ visibility: 'off' }] },

  // ── Water ──
  { featureType: 'water',                 elementType: 'geometry',              stylers: [{ color: '#060e1e' }] },
  { featureType: 'water',                 elementType: 'labels.text.fill',      stylers: [{ color: '#1e3a5f' }] },

  // ── Landscape ──
  { featureType: 'landscape',             elementType: 'geometry',              stylers: [{ color: '#111827' }] },
  { featureType: 'landscape.man_made',    elementType: 'geometry',              stylers: [{ color: '#0f151f' }] },
  { featureType: 'landscape.natural',     elementType: 'geometry',              stylers: [{ color: '#0e1a0e' }] },

  // ── Administrative ──
  { featureType: 'administrative',        elementType: 'geometry.stroke',       stylers: [{ color: '#2a3a50' }, { weight: 0.6 }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill',    stylers: [{ color: '#6b83a8' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels',          stylers: [{ visibility: 'off' }] },
]
