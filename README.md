# Transporte

Aplicación local para explorar y cotizar carga pesada en el eje Cochabamba–Oruro–La Paz. El proyecto separa API Express/MySQL en `backend` y panel Angular en `frontend`.

El frontend inicia con una animación SVG original y selección obligatoria de perfil (chofer/transportista o generador de carga). Muestra Google Maps centrado en Bolivia, con una vista opcional del tramo seleccionado. Incluye cotizaciones, cargas registradas y alertas manuales. Los reportes de novedades se guardan en `route_reports` como pendientes de revisión y no se publican como bloqueos confirmados.

> **Datos por validar:** no se adjuntó el informe de investigación. Las distancias cargadas en `database/schema.sql` son referencias preliminares; los importes de diésel y peajes de Vías Bolivia quedan sin valor oficial. La API calcula un subtotal de combustible y costos operativos, señala el peaje como pendiente y nunca presenta estas cifras como una cotización final verificada. Las alertas se cargan manualmente y no son un feed en tiempo real.

## Requisitos

- Node.js 20+ y npm
- MySQL 8+
- Ollama local y el modelo `gemma3:latest` (opcional para cotizar; requerido para chat)

## Instalación y ejecución (PowerShell)

Desde la carpeta del proyecto:

1. Crear la base de datos (PowerShell): `cmd /c "mysql -u root -p < database\schema.sql"`
2. Configurar API: `Copy-Item backend\.env.example backend\.env`, luego editar `backend\.env`. Definir credenciales MySQL y el precio vigente de diésel (BOB/litro) validado por el proyecto. Mantener el valor sin configurar bloquea las cotizaciones; no se usa un precio inventado.
3. Instalar y arrancar backend: `cd backend; npm install; npm run dev`
4. En otra terminal, descargar el modelo y arrancar Ollama: `ollama pull gemma3:latest` y `ollama serve`
5. En una tercera terminal: `cd frontend; npm install; npm start`
6. Abrir `http://localhost:4200`. API: `http://localhost:3000/api/health`.

Si ya importaste el esquema previamente, vuelve a ejecutar `cmd /c "mysql -u root -p < database\schema.sql"` para crear la tabla de reportes. La importación es idempotente para las tablas y rutas existentes.

Para registrar peajes verificados, completar `routes.tolls_bob` y `routes.tolls_verified_at` con datos oficiales vigentes; para marcar una ruta verificada, actualizar también `data_status`. Las alertas requieren registros activos en `route_alerts`. El mapa de Google requiere conexión a Internet.

## API

- `GET /api/health`, `/api/locations`, `/api/routes`, `/api/loads`, `/api/alerts`
- `POST /api/quotes` con origen, destino y consumo del camión (o un `truckId` registrado)
- `POST /api/quotes/round-trip` para costos ida/vuelta y rentabilidad estimada
- `POST /api/alerts/report` para guardar una novedad pendiente de revisión
- `POST /api/assistant/chat` con `{ "message": "..." }`

El asistente usa `gemma3:latest` por Ollama local y rechaza mensajes sin términos de logística del eje. Su instrucción de sistema limita la respuesta a esta plataforma; el filtro léxico es una barrera básica, no autenticación ni garantía contra toda reformulación.

Pruebas del cálculo: `cd backend; npm test`. Compilación Angular: `cd frontend; npm run build`.
