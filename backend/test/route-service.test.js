const test = require('node:test');
const assert = require('node:assert/strict');
const { findRoutePath, calculateQuote } = require('../src/route-service');

const routes = [
  { origin: 'Cochabamba', destination: 'Oruro', distance_km: 214, tolls_bob: null, data_status: 'estimated' },
  { origin: 'Oruro', destination: 'La Paz', distance_km: 230, tolls_bob: null, data_status: 'estimated' },
  { origin: 'La Paz', destination: 'Oruro', distance_km: 230, tolls_bob: 12, tolls_verified_at: '2026-01-01', data_status: 'verified' },
];

test('resolves the Cochabamba to La Paz path through Oruro', () => {
  const path = findRoutePath(routes, 'Cochabamba', 'La Paz');
  assert.deepEqual(path.map(({ origin, destination }) => [origin, destination]), [
    ['Cochabamba', 'Oruro'],
    ['Oruro', 'La Paz'],
  ]);
});

test('keeps unverified tolls null and marks estimate incomplete', () => {
  const quote = calculateQuote(findRoutePath(routes, 'Cochabamba', 'La Paz'), {
    fuelConsumptionLPer100Km: 40,
    dieselPriceBobPerLiter: 3,
  });
  assert.equal(quote.distanceKm, 444);
  assert.equal(quote.fuelLiters, 177.6);
  assert.equal(quote.tollsBob, null);
  assert.equal(quote.complete, false);
});

test('rejects invalid endpoints and missing fuel price', () => {
  assert.throws(() => findRoutePath(routes, 'Santa Cruz', 'La Paz'), /ciudad del eje/);
  assert.throws(() => calculateQuote(routes.slice(0, 1), {
    fuelConsumptionLPer100Km: 40,
    dieselPriceBobPerLiter: 0,
  }), /precio vigente del diésel/);
});
