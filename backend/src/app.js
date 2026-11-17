const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { LOCATIONS, findRoutePath, calculateQuote } = require('./route-service');
const { askOllama } = require('./ollama');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:4200' }));
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/locations', (_req, res) => res.json(LOCATIONS));

app.get('/api/routes', async (_req, res, next) => {
  try {
    const [routes] = await pool.query(
      `SELECT id, origin, destination, distance_km, diesel_cost_base_bob, tolls_bob,
              tolls_verified_at, data_status, notes
       FROM routes ORDER BY origin, destination`,
    );
    res.json(routes);
  } catch (error) {
    next(error);
  }
});

app.post('/api/quotes', async (req, res, next) => {
  try {
    const { origin, destination, truckId } = req.body;
    let consumption = req.body.fuelConsumptionLPer100Km;
    if (truckId !== undefined) {
      if (!Number.isInteger(Number(truckId)) || Number(truckId) <= 0) {
        return res.status(400).json({ error: 'truckId debe ser un identificador entero positivo.' });
      }
      const [trucks] = await pool.query(
        'SELECT fuel_consumption_l_per_100km FROM trucks WHERE id = ? AND active = TRUE',
        [Number(truckId)],
      );
      if (!trucks.length) return res.status(404).json({ error: 'No se encontró un camión activo con ese ID.' });
      consumption = trucks[0].fuel_consumption_l_per_100km;
    }
    const path = findRoutePath(await getRoutes(), origin, destination);
    const costOptions = await getCostOptions(req.body);
    costOptions.fuelConsumptionLPer100Km = Number(consumption);
    const quote = calculateQuote(path, costOptions);
    res.json({
      ...quote,
      message: quote.complete
        ? 'Cotización calculada con datos verificados.'
        : 'Estimación preliminar: valida distancias y completa los peajes oficiales de Vías Bolivia antes de usarla como cotización final.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/quotes/round-trip', async (req, res, next) => {
  try {
    const { origin, destination, outboundRevenueBob, returnRevenueBob } = req.body;
    for (const [field, value] of Object.entries({ outboundRevenueBob, returnRevenueBob })) {
      if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        return res.status(400).json({ error: `${field} debe ser un monto no negativo.` });
      }
    }
    const routes = await getRoutes();
    const costOptions = await getCostOptions(req.body);
    const outbound = calculateQuote(findRoutePath(routes, origin, destination), costOptions);
    const returnTrip = calculateQuote(findRoutePath(routes, destination, origin), costOptions);
    const totalCostsBob = Number((outbound.subtotalBob + returnTrip.subtotalBob).toFixed(2));
    const totalRevenueBob = Number((Number(outboundRevenueBob || 0) + Number(returnRevenueBob || 0)).toFixed(2));
    res.json({
      outbound,
      returnTrip,
      totalCostsBob,
      totalRevenueBob,
      estimatedProfitBob: Number((totalRevenueBob - totalCostsBob).toFixed(2)),
      complete: outbound.complete && returnTrip.complete,
      message: 'Rentabilidad estimada; excluye los peajes que no estén verificados y los ingresos de retorno no informados.',
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/loads', async (req, res, next) => {
  try {
    const conditions = ["l.status = 'available'", '(l.pickup_at IS NULL OR l.pickup_at >= NOW())'];
    const params = [];
    for (const field of ['origin', 'destination']) {
      if (req.query[field] !== undefined) {
        conditions.push(`l.${field} = ?`);
        params.push(req.query[field]);
      }
    }
    const [loads] = await pool.query(
      `SELECT l.id, l.origin, l.destination, l.description, l.weight_tons,
              l.offered_price_bob, l.pickup_at
       FROM loads l WHERE ${conditions.join(' AND ')} ORDER BY l.created_at DESC LIMIT 100`,
      params,
    );
    res.json(loads);
  } catch (error) {
    next(error);
  }
});

app.post('/api/alerts/report', async (req, res, next) => {
  try {
    const { origin, destination } = req.body;
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!LOCATIONS.includes(origin) || !LOCATIONS.includes(destination) || origin === destination) {
      return res.status(400).json({ error: 'Selecciona un tramo válido entre ciudades del eje.' });
    }
    if (message.length < 10 || message.length > 1000) {
      return res.status(400).json({ error: 'La descripción debe tener entre 10 y 1000 caracteres.' });
    }
    const [routes] = await pool.query(
      'SELECT id FROM routes WHERE origin = ? AND destination = ? LIMIT 1',
      [origin, destination],
    );
    if (!routes.length) {
      return res.status(404).json({ error: `No hay un tramo catalogado de ${origin} a ${destination}.` });
    }
    await pool.query(
      'INSERT INTO route_reports (route_id, message) VALUES (?, ?)',
      [routes[0].id, message],
    );
    res.status(201).json({
      message: 'Reporte recibido para revisión; todavía no es una alerta confirmada.',
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/alerts', async (_req, res, next) => {
  try {
    const [alerts] = await pool.query(
      `SELECT a.id, r.origin, r.destination, a.alert_type, a.message, a.source,
              a.observed_at, a.expires_at
       FROM route_alerts a JOIN routes r ON r.id = a.route_id
       WHERE a.active = TRUE AND (a.expires_at IS NULL OR a.expires_at > NOW())
       ORDER BY a.observed_at DESC`,
    );
    res.json({ alerts, liveFeed: false, note: 'Alertas manuales registradas; no existe conexión a un feed oficial en tiempo real.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/assistant/chat', async (req, res, next) => {
  try {
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 2000) {
      return res.status(400).json({ error: 'El mensaje es obligatorio y no debe superar 2000 caracteres.' });
    }
    res.json(await askOllama(message));
  } catch (error) {
    next(error);
  }
});

async function getRoutes() {
  const [routes] = await pool.query(
    'SELECT origin, destination, distance_km, tolls_bob, tolls_verified_at, data_status FROM routes',
  );
  return routes;
}

async function getCostOptions(body) {
  let dieselPrice = body.dieselPriceBobPerLiter ?? process.env.DIESEL_PRICE_BOB_PER_LITER;
  if (dieselPrice === undefined || dieselPrice === '') {
    const [settings] = await pool.query(
      'SELECT diesel_price_bob_per_liter FROM pricing_settings WHERE id = 1',
    );
    dieselPrice = settings[0]?.diesel_price_bob_per_liter;
  }
  return {
    fuelConsumptionLPer100Km: Number(body.fuelConsumptionLPer100Km),
    dieselPriceBobPerLiter: Number(dieselPrice),
    maintenanceBobPerKm: Number(body.maintenanceBobPerKm ?? process.env.MAINTENANCE_BOB_PER_KM ?? 0),
    driverCostBobPerKm: Number(body.driverCostBobPerKm ?? process.env.DRIVER_COST_BOB_PER_KM ?? 0),
  };
}

app.use((error, _req, res, _next) => {
  const databaseErrors = new Set([
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR',
    'ER_NO_SUCH_TABLE',
  ]);
  if (databaseErrors.has(error.code)) {
    console.error(error);
    return res.status(503).json({
      error: 'Base de datos no lista. Verifica backend/.env, ejecuta database/schema.sql y confirma que MySQL esté iniciado.',
    });
  }
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status === 500 ? 'Error interno del servidor.' : error.message });
});

module.exports = app;
