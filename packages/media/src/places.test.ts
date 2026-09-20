import { describe, expect, it } from 'vitest';
import { haversineKm, nearbySignalFromKm, slugifyPlace } from './places.ts';

describe('slugifyPlace', () => {
  it('normalises names into stable slugs', () => {
    expect(slugifyPlace('Studio floor')).toBe('studio-floor');
    expect(slugifyPlace('  Hampi  Boulders  ')).toBe('hampi-boulders');
    expect(slugifyPlace('Jaipur courtyard')).toBe('jaipur-courtyard');
  });
});

describe('haversineKm', () => {
  it('is ~0 for the same point and ~1,166 km Hampi to Jaipur', () => {
    const hampi = { lat: 15.335, lng: 76.46 };
    const jaipur = { lat: 26.9124, lng: 75.7873 };
    expect(haversineKm(hampi, hampi)).toBeCloseTo(0, 5);
    expect(haversineKm(hampi, jaipur)).toBeGreaterThan(1000);
    expect(haversineKm(hampi, jaipur)).toBeLessThan(1400);
  });
});

describe('nearbySignalFromKm', () => {
  it('is 1 within 25 km and 0 beyond 500 km', () => {
    expect(nearbySignalFromKm(10)).toBe(1);
    expect(nearbySignalFromKm(80)).toBe(0.5);
    expect(nearbySignalFromKm(200)).toBe(0.25);
    expect(nearbySignalFromKm(800)).toBe(0);
    expect(nearbySignalFromKm(null)).toBe(0);
  });
});
