import { Injectable, Logger } from '@nestjs/common';
import { OrganizationProfileService } from './organization-profile.service';

/** Today's weather for the Dashboard. Open-Meteo: free, no API key. */
export type WeatherDto = {
  place: string;
  /** °F */
  temp: number;
  high: number;
  low: number;
  /** Chance of rain or snow today, percent. */
  precipChance: number | null;
  /** WMO weather code. */
  code: number;
  isDay: boolean;
  summary: string;
};

type Coords = { lat: number; lon: number; place: string };

const CACHE_MS = 30 * 60_000;
const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

/** WMO weather interpretation codes → short words. */
export function weatherSummary(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorms';
  return 'Mixed';
}

@Injectable()
export class WeatherService {
  private readonly log = new Logger(WeatherService.name);
  private readonly geoCache = new Map<string, { at: number; coords: Coords | null }>();
  private readonly weatherCache = new Map<string, { at: number; data: WeatherDto }>();

  constructor(private readonly profile: OrganizationProfileService) {}

  /**
   * Weather at the given coordinates (the person's browser, when they already allowed location),
   * else at the business address in Settings. Null when neither is known or the service is down.
   */
  async today(lat?: number, lon?: number): Promise<WeatherDto | null> {
    const coords = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat, lon, place: '' }
      : await this.businessCoords();
    if (!coords) return null;

    const key = `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}`;
    const hit = this.weatherCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.data, place: coords.place || hit.data.place };

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
        '&current=temperature_2m,weather_code,is_day' +
        '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&temperature_unit=fahrenheit&timezone=auto&forecast_days=1';
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const j = (await res.json()) as {
        current: { temperature_2m: number; weather_code: number; is_day: number };
        daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[] };
      };
      const data: WeatherDto = {
        place: coords.place,
        temp: Math.round(j.current.temperature_2m),
        high: Math.round(j.daily.temperature_2m_max[0]),
        low: Math.round(j.daily.temperature_2m_min[0]),
        precipChance: j.daily.precipitation_probability_max?.[0] ?? null,
        code: j.current.weather_code,
        isDay: j.current.is_day === 1,
        summary: weatherSummary(j.current.weather_code),
      };
      this.weatherCache.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      this.log.warn(`Weather lookup failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /** Business address (Settings) → coordinates, via Open-Meteo geocoding. Cached per address. */
  private async businessCoords(): Promise<Coords | null> {
    const b = await this.profile.getBranding();
    const city = b.city?.trim();
    const state = b.state?.trim();
    const zip = b.zip?.trim();
    if (!city && !zip) return null;
    const cacheKey = `${city}|${state}|${zip}`;
    const hit = this.geoCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 24 * 3_600_000) return hit.coords;

    const stateName = state ? (US_STATES[state.toUpperCase()] ?? state) : '';
    let coords: Coords | null = null;
    for (const name of [city, zip].filter((x): x is string => !!x)) {
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) continue;
        const j = (await res.json()) as { results?: { latitude: number; longitude: number; name: string; admin1?: string; country_code?: string }[] };
        const results = j.results ?? [];
        const match =
          results.find((r) => stateName && r.admin1?.toLowerCase() === stateName.toLowerCase()) ??
          results.find((r) => r.country_code === 'US') ??
          results[0];
        if (match) {
          coords = { lat: match.latitude, lon: match.longitude, place: city || match.name };
          break;
        }
      } catch (err) {
        this.log.warn(`Geocoding failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    this.geoCache.set(cacheKey, { at: Date.now(), coords });
    return coords;
  }
}
