const LOCATIONS = ['Cochabamba', 'Oruro', 'Patacamaya', 'La Paz'];

function assertLocation(value, field) {
  if (!LOCATIONS.includes(value)) {
    const error = new Error(`${field} debe ser una ciudad del eje: ${LOCATIONS.join(', ')}.`);
    error.status = 400;
    throw error;
  }
}

function findRoutePath(routes, origin, destination) {
  assertLocation(origin, 'origin');
  assertLocation(destination, 'destination');
  if (origin === destination) {
    const error = new Error('El origen y el destino deben ser distintos.');
    error.status = 400;
    throw error;
  }

  const distances = new Map(LOCATIONS.map((location) => [location, Infinity]));
  const previous = new Map();
  const unvisited = new Set(LOCATIONS);
  distances.set(origin, 0);

  while (unvisited.size > 0) {
    let current = null;
    for (const location of unvisited) {
      if (current === null || distances.get(location) < distances.get(current)) current = location;
    }
    if (current === null || !Number.isFinite(distances.get(current))) break;
    if (current === destination) break;
    unvisited.delete(current);

    for (const route of routes) {
      if (route.origin !== current || !unvisited.has(route.destination)) continue;
      const candidate = distances.get(current) + Number(route.distance_km);
      if (candidate < distances.get(route.destination)) {
        distances.set(route.destination, candidate);
        previous.set(route.destination, { location: current, route });
      }
    }
  }

  if (!previous.has(destination)) {
    const error = new Error(`No hay una ruta registrada entre ${origin} y ${destination}.`);
    error.status = 404;
    throw error;
  }

  const path = [];
  let cursor = destination;
  while (cursor !== origin) {
    const step = previous.get(cursor);
    if (!step) {
      const error = new Error('No se pudo reconstruir el trayecto solicitado.');
      error.status = 500;
      throw error;
    }
    path.unshift(step.route);
    cursor = step.location;
  }
  return path;
}

function calculateQuote(path, options) {
  const {
    fuelConsumptionLPer100Km,
    dieselPriceBobPerLiter,
    maintenanceBobPerKm = 0,
    driverCostBobPerKm = 0,
  } = options;
  const values = [fuelConsumptionLPer100Km, dieselPriceBobPerLiter, maintenanceBobPerKm, driverCostBobPerKm];
  if (values.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)
      || Number(fuelConsumptionLPer100Km) <= 0
      || Number(dieselPriceBobPerLiter) <= 0) {
    const error = new Error('Indica consumo del camión (> 0) y precio vigente del diésel (> 0); los demás costos no pueden ser negativos.');
    error.status = 400;
    throw error;
  }

  const distanceKm = path.reduce((total, route) => total + Number(route.distance_km), 0);
  const fuelLiters = distanceKm * Number(fuelConsumptionLPer100Km) / 100;
  const fuelCostBob = fuelLiters * Number(dieselPriceBobPerLiter);
  const maintenanceCostBob = distanceKm * Number(maintenanceBobPerKm);
  const driverCostBob = distanceKm * Number(driverCostBobPerKm);
  const tollsComplete = path.every((route) => route.tolls_bob !== null && route.tolls_bob !== undefined);
  const tollsBob = tollsComplete
    ? path.reduce((total, route) => total + Number(route.tolls_bob), 0)
    : null;

  return {
    origin: path[0].origin,
    destination: path[path.length - 1].destination,
    distanceKm,
    segments: path.map((route) => ({
      origin: route.origin,
      destination: route.destination,
      distanceKm: Number(route.distance_km),
      dataStatus: route.data_status,
      tollsBob: route.tolls_bob === null || route.tolls_bob === undefined ? null : Number(route.tolls_bob),
      tollsVerifiedAt: route.tolls_verified_at || null,
    })),
    fuelLiters: Number(fuelLiters.toFixed(2)),
    fuelCostBob: Number(fuelCostBob.toFixed(2)),
    maintenanceCostBob: Number(maintenanceCostBob.toFixed(2)),
    driverCostBob: Number(driverCostBob.toFixed(2)),
    tollsBob: tollsBob === null ? null : Number(tollsBob.toFixed(2)),
    subtotalBob: Number((fuelCostBob + maintenanceCostBob + driverCostBob + (tollsBob || 0)).toFixed(2)),
    tollsComplete,
    estimateOnly: path.some((route) => route.data_status !== 'verified'),
    complete: tollsComplete && path.every((route) => route.data_status === 'verified'),
  };
}

module.exports = { LOCATIONS, assertLocation, findRoutePath, calculateQuote };
