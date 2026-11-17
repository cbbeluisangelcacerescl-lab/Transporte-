const LOGISTICS_TERMS = /\b(?:log[ií]stic[ao]|transporte(?: pesado)?|transportista|chofer(?:es)?|cami[oó]n(?:es|ero)?|carga(?:s)?|env[ií]o(?:s)?|flete(?:s)?|ruta(?:s)?|carretera(?:s)?|camino(?:s)?|tramo(?:s)?|cochabamba|oruro|patacamaya|la paz|peaje(?:s)?|di[eé]sel|combustible|retorno|bloqueo(?:s)?|unidad(?:es)?|tonelada(?:s)?|rastreo|cargador|generador de carga|recorrido(?:s)?|viaje(?:s)?|disponibilidad|disponible)\b/i;

const OUT_OF_SCOPE_ANSWER =
  'Solo puedo responder consultas sobre la plataforma de logística de carga pesada y las rutas del eje Cochabamba–Oruro–Patacamaya–La Paz.';

function isLogisticsQuestion(message) {
  return LOGISTICS_TERMS.test(message);
}

module.exports = { isLogisticsQuestion, OUT_OF_SCOPE_ANSWER };
