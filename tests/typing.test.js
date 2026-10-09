import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABNT2_ROWS, LIMITS, TypingSession, accuracy, addResult, buildText, charsMatch, consistency,
  emptyStore, generateWords, heatByKey, keysForChar, mulberry32, parseStore, perSecondCounts,
  recordKey, stripAccents, topMissed, wpm, HISTORY_LIMIT,
} from '../src/typing.js';
import { WORDS } from '../src/texts.js';

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} ≠ ${expected}`);

// Digita caractere por caractere, um a cada `step` ms, a partir de t = 0.
function typeAll(session, text, step = 200, startAt = 0) {
  let value = session.typed.join('');
  let now = startAt;
  for (const char of Array.from(text)) {
    value += char;
    session.update(value, now);
    now += step;
  }
  return now - step;
}

test('PPM usa 5 caracteres por palavra e conta só os corretos', () => {
  assert.equal(wpm(250, 60000), 50);
  assert.equal(wpm(125, 30000), 50);
  assert.equal(wpm(100, 120000), 10);
  assert.equal(wpm(0, 60000), 0);
  assert.equal(wpm(50, 0), 0);
  assert.equal(wpm(50, -10), 0);
});

test('precisão é a porcentagem de teclas certas', () => {
  assert.equal(accuracy(95, 100), 95);
  assert.equal(accuracy(3, 4), 75);
  assert.equal(accuracy(0, 0), 0);
});

test('acentos: NFC e NFD são o mesmo caractere', () => {
  const nfd = 'a\u0301';
  assert.notEqual(nfd, 'á');
  const session = new TypingSession('já');
  session.update(`j${nfd}`, 0);
  assert.deepEqual(session.typed, ['j', 'á']);
  assert.equal(session.correctCount(), 2);
  assert.equal(session.keystrokes.every((k) => k.correct), true);
});

test('o texto alvo também é normalizado para NFC', () => {
  const session = new TypingSession('ac\u0327a\u0303o');
  assert.deepEqual(session.target, ['a', 'ç', 'ã', 'o']);
});

test('sem a opção, acento errado ou faltando conta como erro', () => {
  assert.equal(charsMatch('á', 'á'), true);
  assert.equal(charsMatch('a', 'á'), false);
  assert.equal(charsMatch('à', 'á'), false);
  assert.equal(charsMatch('c', 'ç'), false);
});

test('modo ignorar acentos aceita a letra sem acento, mas não troca de letra nem de caixa', () => {
  assert.equal(charsMatch('a', 'á', true), true);
  assert.equal(charsMatch('a', 'ã', true), true);
  assert.equal(charsMatch('c', 'ç', true), true);
  assert.equal(charsMatch('E', 'É', true), true);
  assert.equal(charsMatch('e', 'É', true), false);
  assert.equal(charsMatch('o', 'á', true), false);
  assert.equal(stripAccents('ação à pôr Ü'), 'acao a por U');

  const strict = new TypingSession('ação');
  typeAll(strict, 'acao');
  assert.equal(strict.results(1000).errors, 2);

  const relaxed = new TypingSession('ação', { ignoreAccents: true });
  typeAll(relaxed, 'acao');
  const r = relaxed.results(1000);
  assert.equal(r.errors, 0);
  assert.equal(r.correctChars, 4);
});

test('erros corrigidos com backspace continuam pesando na precisão', () => {
  const session = new TypingSession('casa');
  session.update('c', 0);
  session.update('cx', 100); // erro
  session.update('c', 200); // apagou
  session.update('ca', 300);
  session.update('cas', 400);
  session.update('casa', 500);
  assert.equal(session.finished, true);
  const r = session.results(500);
  assert.equal(r.keystrokes, 5);
  assert.equal(r.errors, 1);
  near(r.accuracy, 80);
  assert.equal(r.uncorrected, 0);
  assert.equal(r.correctChars, 4);
  assert.deepEqual(r.missed, [{ char: 'a', count: 1 }]);
});

test('sessão por tempo: PPM calculado sobre a duração e erros não corrigidos', () => {
  const session = new TypingSession('ab cd ef gh', { durationMs: 60000 });
  session.update('a', 0);
  session.update('ab', 1000);
  session.update('ab ', 2000);
  session.update('ab x', 3000); // erro não corrigido
  assert.equal(session.timeUp(59999), false);
  assert.equal(session.timeUp(60000), true);
  session.finish(75000);
  const r = session.results(80000);
  assert.equal(r.elapsedMs, 60000);
  assert.equal(r.correctChars, 3);
  near(r.ppm, 3 / 5);
  assert.equal(r.uncorrected, 1);
  assert.equal(session.wordsDone(), 1);
  assert.equal(session.totalWords(), 4);
});

test('estados para o destaque ao vivo', () => {
  const session = new TypingSession('olá');
  session.update('ol', 0);
  assert.deepEqual(session.states(), ['correct', 'correct', 'pending']);
  session.update('ola', 100);
  assert.deepEqual(session.states(), ['correct', 'correct', 'incorrect']);
});

test('valor maior que o texto é cortado e encerra a sessão', () => {
  const session = new TypingSession('oi');
  session.update('oi!!', 10);
  assert.deepEqual(session.typed, ['o', 'i']);
  assert.equal(session.finished, true);
  assert.deepEqual(session.update('oi', 20), { inserted: 0, removed: 0 });
});

test('consistência: ritmo constante é 100%, oscilação reduz', () => {
  assert.equal(consistency([5, 5, 5, 5]), 100);
  near(consistency([4, 6]), 80);
  assert.equal(consistency([0, 10]), 0);
  assert.equal(consistency([0, 0, 0]), 0);
  assert.equal(consistency([7]), null);
  assert.equal(consistency([]), null);
  assert.ok(consistency([5, 6, 5, 6]) > consistency([2, 9, 1, 10]));
});

test('contagem por segundo ignora o segundo incompleto', () => {
  const keys = [0, 100, 900, 1000, 1500, 2100, 2999, 3100].map((t) => ({ t }));
  assert.deepEqual(perSecondCounts(keys, 3200), [3, 2, 2]);
  assert.deepEqual(perSecondCounts(keys, 500), []);
});

test('gerador com semente é determinístico e não repete palavra seguida', () => {
  const a = generateWords(mulberry32(42), 200);
  const b = generateWords(mulberry32(42), 200);
  const c = generateWords(mulberry32(43), 200);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (let i = 1; i < a.length; i++) assert.notEqual(a[i], a[i - 1]);
  assert.ok(a.every((w) => WORDS.includes(w)));
  assert.deepEqual(buildText({ mode: 'frases', limitId: 'tempo-60', rng: mulberry32(7) }), buildText({ mode: 'frases', limitId: 'tempo-60', rng: mulberry32(7) }));
});

test('mulberry32 gera números entre 0 e 1', () => {
  const rng = mulberry32(123);
  for (let i = 0; i < 1000; i++) {
    const n = rng();
    assert.ok(n >= 0 && n < 1);
  }
});

test('limite por palavras gera exatamente essa quantidade em todos os modos', () => {
  for (const mode of ['palavras', 'frases', 'textos', 'numeros']) {
    for (const limit of LIMITS.filter((l) => l.type === 'words')) {
      const text = buildText({ mode, limitId: limit.id, rng: mulberry32(limit.value) });
      assert.equal(text.split(' ').length, limit.value, `${mode} ${limit.id}`);
      assert.doesNotMatch(text, / {2}|^ | $/);
    }
  }
});

test('limite por tempo gera texto de sobra (220 palavras por minuto)', () => {
  const text = buildText({ mode: 'palavras', limitId: 'tempo-120', rng: mulberry32(1) });
  assert.equal(text.split(' ').length, 440);
  const short = buildText({ mode: 'textos', limitId: 'tempo-15', rng: mulberry32(1) });
  assert.equal(short.split(' ').length, 55);
});

test('modo números e símbolos: só caracteres digitáveis e contas corretas', () => {
  const text = buildText({ mode: 'numeros', limitId: 'tempo-120', rng: mulberry32(99) });
  assert.match(text, /^[0-9R$,.%/:;#@!?&*+\-=()[\]{}<> ]+$/);
  const exprs = text.match(/\(?\d+ [-+*/] \d+\)?(?: \* \d+)? = \d+/g) || [];
  assert.ok(exprs.length > 5);
  const ops = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b };
  for (const expr of exprs) {
    const [left, right] = expr.split(' = ');
    const grouped = left.match(/^\((\d+) \+ (\d+)\) \* (\d+)$/);
    const simple = left.match(/^(\d+) ([-+*/]) (\d+)$/);
    const value = grouped
      ? (Number(grouped[1]) + Number(grouped[2])) * Number(grouped[3])
      : ops[simple[2]](Number(simple[1]), Number(simple[3]));
    assert.equal(value, Number(right), expr);
  }
  for (const date of text.match(/\d{2}\/\d{2}\/\d{4}/g) || []) {
    const [d, m, y] = date.split('/').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    assert.equal(parsed.getUTCDate(), d, date);
    assert.equal(parsed.getUTCMonth(), m - 1, date);
  }
});

test('teclas do ABNT2 para letras, acentos e símbolos', () => {
  assert.deepEqual(keysForChar('a'), ['a']);
  assert.deepEqual(keysForChar('A'), ['a']);
  assert.deepEqual(keysForChar('ç'), ['ç']);
  assert.deepEqual(keysForChar('Ç'), ['ç']);
  assert.deepEqual(keysForChar('á'), ['a', '´']);
  assert.deepEqual(keysForChar('à'), ['a', '´']);
  assert.deepEqual(keysForChar('ã'), ['a', '~']);
  assert.deepEqual(keysForChar('ê'), ['e', '~']);
  assert.deepEqual(keysForChar('Ô'), ['o', '~']);
  assert.deepEqual(keysForChar('ü'), ['u', '6']);
  assert.deepEqual(keysForChar(' '), ['space']);
  assert.deepEqual(keysForChar('?'), ['/']);
  assert.deepEqual(keysForChar('@'), ['2']);
  assert.deepEqual(keysForChar(':'), [';']);
  assert.deepEqual(keysForChar('€'), []);
  const all = new Set(ABNT2_ROWS.flat());
  assert.equal(all.size, ABNT2_ROWS.flat().length, 'teclas repetidas no layout');
});

test('mapa de calor soma os erros por tecla', () => {
  const missed = new Map([['á', 2], ['a', 1], ['ã', 3], [' ', 4]]);
  const heat = heatByKey(missed);
  assert.equal(heat.get('a'), 6);
  assert.equal(heat.get('´'), 2);
  assert.equal(heat.get('~'), 3);
  assert.equal(heat.get('space'), 4);
  assert.deepEqual(topMissed(missed, 2), [{ char: ' ', count: 4 }, { char: 'ã', count: 3 }]);
});

test('histórico guarda os mais recentes e o recorde por configuração', () => {
  const base = { mode: 'palavras', limitId: 'tempo-30', ignoreAccents: false, accuracy: 95, errors: 2, consistency: 80 };
  let store = emptyStore();
  let out = addResult(store, { ...base, date: '2026-10-01T10:00:00.000Z', ppm: 40 });
  assert.equal(out.isRecord, true);
  assert.equal(out.previous, null);
  store = out.store;
  out = addResult(store, { ...base, date: '2026-10-02T10:00:00.000Z', ppm: 35 });
  assert.equal(out.isRecord, false);
  assert.equal(out.previous.ppm, 40);
  store = out.store;
  out = addResult(store, { ...base, date: '2026-10-03T10:00:00.000Z', ppm: 52 });
  assert.equal(out.isRecord, true);
  store = out.store;
  assert.equal(store.records[recordKey(base)].ppm, 52);
  assert.equal(store.history[0].ppm, 52);
  assert.equal(store.history.length, 3);

  const other = addResult(store, { ...base, ignoreAccents: true, date: '2026-10-04T10:00:00.000Z', ppm: 30 });
  assert.equal(other.isRecord, true, 'ignorar acentos tem recorde separado');

  for (let i = 0; i < 60; i++) store = addResult(store, { ...base, date: '2026-10-05T10:00:00.000Z', ppm: i }).store;
  assert.equal(store.history.length, HISTORY_LIMIT);
  assert.throws(() => addResult(store, { ...base, ppm: 'rápido' }), /inválido/);
});

test('dados salvos corrompidos não quebram o app', () => {
  assert.deepEqual(parseStore('{isso não é json'), emptyStore());
  assert.deepEqual(parseStore('null'), emptyStore());
  const saved = {
    records: { 'palavras|tempo-30|com-acentos': { date: 'x', mode: 'palavras', limitId: 'tempo-30', ppm: 50, accuracy: 90, errors: 1 }, lixo: 3 },
    history: [{ date: 'x', mode: 'inexistente', limitId: 'tempo-30', ppm: 1, accuracy: 1, errors: 0 }, { date: 'y', mode: 'textos', limitId: 'palavras-25', ppm: 33, accuracy: 99, errors: 0, consistency: 'alta' }],
  };
  const store = parseStore(JSON.stringify(saved));
  assert.deepEqual(Object.keys(store.records), ['palavras|tempo-30|com-acentos']);
  assert.equal(store.history.length, 1);
  assert.equal(store.history[0].consistency, null);
});
