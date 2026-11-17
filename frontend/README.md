# Frontend Angular

Panel web de CargaRuta para choferes y generadores de carga. El inicio incluye una animación vectorial original; el tablero muestra Google Maps centrado en Bolivia y vistas de tramo.

Desde esta carpeta:

```powershell
npm install
npm start
```

Abrir `http://localhost:4200`. El proxy de desarrollo envía `/api` a `http://localhost:3000`; inicia también el backend y MySQL según las instrucciones del [README principal](../README.md).

Verificación local:

```powershell
npm run build
npm test -- --watch=false
```
