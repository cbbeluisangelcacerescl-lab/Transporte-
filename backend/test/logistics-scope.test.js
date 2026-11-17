const test = require('node:test');
const assert = require('node:assert/strict');
const { isLogisticsQuestion, OUT_OF_SCOPE_ANSWER } = require('../src/logistics-scope');

test('allows questions about the transport system and its routes', () => {
  assert.equal(isLogisticsQuestion('¿Qué cargas hay de La Paz a Cochabamba?'), true);
  assert.equal(isLogisticsQuestion('¿Cuánto consume el camión en el tramo a Oruro?'), true);
});

test('rejects unrelated topics before they are sent to the model', () => {
  assert.equal(isLogisticsQuestion('Escribe un poema sobre el universo.'), false);
  assert.match(OUT_OF_SCOPE_ANSWER, /Solo puedo responder consultas sobre la plataforma/);
});
