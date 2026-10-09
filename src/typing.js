// Lógica do treino: geração dos textos, comparação de caracteres, sessão de digitação,
// estatísticas e histórico. Não usa DOM, por isso é o que os testes importam.
import { PARAGRAPHS, SENTENCES, WORDS } from './texts.js';

export const MODES = {
  palavras: 'Palavras',
  frases: 'Frases',
  textos: 'Textos',
  numeros: 'Números e símbolos',
};

export const LIMITS = [
  { id: 'tempo-15', type: 'time', value: 15, label: '15 s' },
  { id: 'tempo-30', type: 'time', value: 30, label: '30 s' },
  { id: 'tempo-60', type: 'time', value: 60, label: '60 s' },
  { id: 'tempo-120', type: 'time', value: 120, label: '120 s' },
  { id: 'palavras-10', type: 'words', value: 10, label: '10 palavras' },
  { id: 'palavras-25', type: 'words', value: 25, label: '25 palavras' },
  { id: 'palavras-50', type: 'words', value: 50, label: '50 palavras' },
  { id: 'palavras-100', type: 'words', value: 100, label: '100 palavras' },
];

export const CHARS_PER_WORD = 5;

export function findLimit(id) {
  return LIMITS.find((limit) => limit.id === id) || LIMITS[1];
}

// ---------- texto e acentos ----------

export const toNFC = (text) => String(text ?? '').normalize('NFC');

export function stripAccents(text) {
  return toNFC(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

export function charsMatch(typed, expected, ignoreAccents = false) {
  if (typed === expected) return true;
  if (!ignoreAccents || typed === undefined || expected === undefined) return false;
  return stripAccents(typed) === stripAccents(expected);
}

// ---------- sorteio com semente (repetível nos testes) ----------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export function shuffle(rng, list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Sorteia palavras da lista sem repetir a mesma palavra duas vezes seguidas. */
export function generateWords(rng, count, list = WORDS) {
  const words = [];
  while (words.length < count) {
    const word = pick(rng, list);
    if (list.length > 1 && word === words[words.length - 1]) continue;
    words.push(word);
  }
  return words;
}

// Frases e textos entram em ordem embaralhada, sem repetir até usar todos.
function wordsFromTexts(rng, texts, needed) {
  const words = [];
  let queue = [];
  while (words.length < needed) {
    if (!queue.length) queue = shuffle(rng, texts);
    words.push(...queue.shift().split(' '));
  }
  return words;
}

const pad2 = (n) => String(n).padStart(2, '0');
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const NUMBER_TOKENS = [
  (rng) => String(randomInt(rng, 0, 9999)),
  (rng) => `${randomInt(rng, 0, 999)},${pad2(randomInt(rng, 0, 99))}`,
  (rng) => `R$ ${thousands(randomInt(rng, 1, 9999))},${pad2(randomInt(rng, 0, 99))}`,
  (rng) => `${randomInt(rng, 1, 100)}%`,
  (rng) => {
    const year = randomInt(rng, 1990, 2030);
    const month = randomInt(rng, 1, 12);
    return `${pad2(randomInt(rng, 1, daysInMonth(year, month)))}/${pad2(month)}/${year}`;
  },
  (rng) => `${pad2(randomInt(rng, 0, 23))}:${pad2(randomInt(rng, 0, 59))}`,
  (rng) => {
    const a = randomInt(rng, 1, 50);
    const b = randomInt(rng, 1, 50);
    return `${a} + ${b} = ${a + b}`;
  },
  (rng) => {
    const a = randomInt(rng, 10, 99);
    const b = randomInt(rng, 1, a);
    return `${a} - ${b} = ${a - b}`;
  },
  (rng) => {
    const a = randomInt(rng, 2, 12);
    const b = randomInt(rng, 2, 12);
    return `${a} * ${b} = ${a * b}`;
  },
  (rng) => {
    const divisor = randomInt(rng, 2, 9);
    const quotient = randomInt(rng, 2, 12);
    return `${divisor * quotient} / ${divisor} = ${quotient}`;
  },
  (rng) => {
    const a = randomInt(rng, 1, 9);
    const b = randomInt(rng, 1, 9);
    const c = randomInt(rng, 2, 5);
    return `(${a} + ${b}) * ${c} = ${(a + b) * c}`;
  },
  (rng) => {
    const n = randomInt(rng, 1, 999);
    return pick(rng, [`#${n}`, `@${n}`, `${n}!`, `${n}?`, `[${n}]`, `{${n}}`, `<${n}>`, `(${n})`, `$${n}`, `${n};`, `${n}:`]);
  },
  (rng) => {
    const a = randomInt(rng, 1, 99);
    const b = randomInt(rng, 1, 99);
    return `${a}${pick(rng, ['&', '/', '*', '+', '-', '=', '%', '#', '@'])}${b}`;
  },
];

function numberWords(rng, needed) {
  const words = [];
  while (words.length < needed) words.push(...pick(rng, NUMBER_TOKENS)(rng).split(' '));
  return words;
}

/**
 * Monta o texto do treino. No limite por palavras, o texto tem exatamente essa quantidade;
 * no limite por tempo, sobra texto até para quem digita 220 palavras por minuto.
 */
export function buildText({ mode = 'palavras', limitId = 'tempo-30', rng = Math.random } = {}) {
  const limit = findLimit(limitId);
  const needed = limit.type === 'words' ? limit.value : Math.max(40, Math.ceil((limit.value / 60) * 220));
  let words;
  if (mode === 'frases') words = wordsFromTexts(rng, SENTENCES, needed);
  else if (mode === 'textos') words = wordsFromTexts(rng, PARAGRAPHS, needed);
  else if (mode === 'numeros') words = numberWords(rng, needed);
  else words = generateWords(rng, needed);
  return words.slice(0, needed).join(' ');
}

// ---------- contas ----------

/** Palavras por minuto no padrão de 5 caracteres por palavra. */
export function wpm(chars, ms) {
  if (!(ms > 0) || !(chars > 0)) return 0;
  return chars / CHARS_PER_WORD / (ms / 60000);
}

/** Porcentagem de teclas certas (0 a 100). */
export function accuracy(correctKeys, totalKeys) {
  if (!(totalKeys > 0)) return 0;
  return (correctKeys / totalKeys) * 100;
}

/** Teclas digitadas em cada segundo completo do treino. */
export function perSecondCounts(keystrokes, elapsedMs) {
  const seconds = Math.floor(elapsedMs / 1000);
  const counts = new Array(Math.max(0, seconds)).fill(0);
  for (const key of keystrokes) {
    const second = Math.floor(key.t / 1000);
    if (second < seconds) counts[second] += 1;
  }
  return counts;
}

/**
 * Consistência: 100% menos o coeficiente de variação do ritmo segundo a segundo.
 * Ritmo constante dá 100%; ritmo que oscila muito se aproxima de 0%.
 * Devolve null quando há menos de 2 segundos completos para comparar.
 */
export function consistency(counts) {
  if (counts.length < 2) return null;
  const mean = counts.reduce((sum, n) => sum + n, 0) / counts.length;
  if (mean === 0) return 0;
  const variance = counts.reduce((sum, n) => sum + (n - mean) ** 2, 0) / counts.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(100, 100 * (1 - cv)));
}

// ---------- teclado ABNT2 ----------

export const ABNT2_ROWS = [
  ["'", '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '´', '['],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç', '~', ']'],
  ['\\', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', ';', '/'],
  ['space'],
];

const KEY_IDS = new Set(ABNT2_ROWS.flat());
// Caracteres que saem com Shift em cada tecla do ABNT2.
const SHIFTED = {
  '"': "'", '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '¨': '6', '&': '7', '*': '8', '(': '9',
  ')': '0', _: '-', '+': '=', '`': '´', '{': '[', '^': '~', '}': ']', '|': '\\', '<': ',', '>': '.',
  ':': ';', '?': '/',
};
// Acentos digitados com tecla morta: agudo e grave na tecla ´, til e circunflexo na tecla ~, trema no 6.
const DEAD_KEYS = { '\u0301': '´', '\u0300': '´', '\u0303': '~', '\u0302': '~', '\u0308': '6' };

/** Teclas do ABNT2 usadas para produzir o caractere (letra base + tecla do acento). */
export function keysForChar(char) {
  if (char === ' ') return ['space'];
  const lower = String(char).toLowerCase();
  if (KEY_IDS.has(lower)) return [lower];
  if (SHIFTED[char]) return [SHIFTED[char]];
  const [base, ...marks] = [...lower.normalize('NFD')];
  if (marks.length === 1 && DEAD_KEYS[marks[0]] && KEY_IDS.has(base)) return [base, DEAD_KEYS[marks[0]]];
  return [];
}

export function heatByKey(missed) {
  const heat = new Map();
  for (const [char, count] of missed) {
    for (const key of keysForChar(char)) heat.set(key, (heat.get(key) || 0) + count);
  }
  return heat;
}

export function topMissed(missed, limit = 5) {
  return [...missed.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, limit)
    .map(([char, count]) => ({ char, count }));
}

export const charName = (char) => (char === ' ' ? 'espaço' : char);

// ---------- sessão ----------

export class TypingSession {
  constructor(target, { ignoreAccents = false, durationMs = null } = {}) {
    this.target = Array.from(toNFC(target));
    this.ignoreAccents = ignoreAccents;
    this.durationMs = durationMs;
    this.typed = [];
    this.keystrokes = [];
    this.missed = new Map();
    this.startedAt = null;
    this.finishedAt = null;
  }

  get started() { return this.startedAt !== null; }

  get finished() { return this.finishedAt !== null; }

  start(now) {
    if (this.startedAt === null) this.startedAt = now;
  }

  /**
   * Recebe o valor completo e já confirmado do campo (fora de composição de acento).
   * Compara com o valor anterior: o que foi acrescentado conta como teclas digitadas.
   */
  update(value, now) {
    if (this.finished) return { inserted: 0, removed: 0 };
    const next = Array.from(toNFC(value)).slice(0, this.target.length);
    let same = 0;
    while (same < next.length && same < this.typed.length && next[same] === this.typed[same]) same += 1;
    const added = next.slice(same);
    if (added.length) this.start(now);
    const t = this.started ? now - this.startedAt : 0;
    added.forEach((char, i) => {
      const expected = this.target[same + i];
      const correct = charsMatch(char, expected, this.ignoreAccents);
      this.keystrokes.push({ t, correct, expected, typed: char });
      if (!correct) this.missed.set(expected, (this.missed.get(expected) || 0) + 1);
    });
    const removed = this.typed.length - same;
    this.typed = next;
    if (this.typed.length >= this.target.length) this.finish(now);
    return { inserted: added.length, removed };
  }

  timeUp(now) {
    return this.durationMs !== null && this.started && now - this.startedAt >= this.durationMs;
  }

  finish(now) {
    if (this.finished) return;
    this.finishedAt = this.durationMs !== null && this.started ? Math.min(now, this.startedAt + this.durationMs) : now;
  }

  elapsed(now) {
    if (!this.started) return 0;
    const ms = (this.finishedAt ?? now) - this.startedAt;
    return this.durationMs !== null ? Math.min(ms, this.durationMs) : ms;
  }

  correctCount(typed = this.typed) {
    let count = 0;
    typed.forEach((char, i) => {
      if (charsMatch(char, this.target[i], this.ignoreAccents)) count += 1;
    });
    return count;
  }

  /** Estado de cada caractere do texto: 'correct', 'incorrect' ou 'pending'. */
  states(typed = this.typed) {
    return this.target.map((expected, i) => {
      if (i >= typed.length) return 'pending';
      return charsMatch(typed[i], expected, this.ignoreAccents) ? 'correct' : 'incorrect';
    });
  }

  /** Quantas palavras do texto já foram completadas (contando pelos espaços). */
  wordsDone() {
    let done = 0;
    for (let i = 0; i < this.typed.length; i++) if (this.target[i] === ' ') done += 1;
    if (this.typed.length >= this.target.length) done += 1;
    return done;
  }

  totalWords() {
    return this.target.length ? this.target.filter((c) => c === ' ').length + 1 : 0;
  }

  results(now) {
    const elapsedMs = this.elapsed(now);
    const correctChars = this.correctCount();
    const correctKeys = this.keystrokes.filter((k) => k.correct).length;
    return {
      elapsedMs,
      ppm: wpm(correctChars, elapsedMs),
      rawPpm: wpm(this.keystrokes.length, elapsedMs),
      accuracy: accuracy(correctKeys, this.keystrokes.length),
      errors: this.keystrokes.length - correctKeys,
      uncorrected: this.typed.length - correctChars,
      correctChars,
      typedChars: this.typed.length,
      keystrokes: this.keystrokes.length,
      consistency: consistency(perSecondCounts(this.keystrokes, elapsedMs)),
      missed: topMissed(this.missed, 5),
      heat: heatByKey(this.missed),
    };
  }
}

// ---------- recordes e histórico ----------

export const HISTORY_LIMIT = 50;

export function recordKey({ mode, limitId, ignoreAccents }) {
  return `${mode}|${limitId}|${ignoreAccents ? 'sem-acentos' : 'com-acentos'}`;
}

export function emptyStore() {
  return { version: 1, records: {}, history: [] };
}

const isNumber = (n) => typeof n === 'number' && Number.isFinite(n);

function cleanEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const { date, mode, limitId, ignoreAccents, ppm, accuracy: acc, errors, consistency: cons } = entry;
  if (typeof date !== 'string' || !MODES[mode] || !LIMITS.some((l) => l.id === limitId)) return null;
  if (!isNumber(ppm) || !isNumber(acc) || !isNumber(errors)) return null;
  return { date, mode, limitId, ignoreAccents: Boolean(ignoreAccents), ppm, accuracy: acc, errors, consistency: isNumber(cons) ? cons : null };
}

/** Lê o que estava salvo, descartando qualquer coisa inválida. */
export function parseStore(json) {
  const store = emptyStore();
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return store;
  }
  if (!data || typeof data !== 'object') return store;
  if (Array.isArray(data.history)) store.history = data.history.map(cleanEntry).filter(Boolean).slice(0, HISTORY_LIMIT);
  if (data.records && typeof data.records === 'object') {
    for (const [key, value] of Object.entries(data.records)) {
      const entry = cleanEntry(value);
      if (entry && recordKey(entry) === key) store.records[key] = entry;
    }
  }
  return store;
}

/** Acrescenta um resultado (mais recente primeiro) e atualiza o recorde da configuração. */
export function addResult(store, entry) {
  const clean = cleanEntry(entry);
  if (!clean) throw new Error('Resultado inválido.');
  const key = recordKey(clean);
  const previous = store.records[key] || null;
  const isRecord = !previous || clean.ppm > previous.ppm;
  return {
    store: {
      version: 1,
      records: isRecord ? { ...store.records, [key]: clean } : { ...store.records },
      history: [clean, ...store.history].slice(0, HISTORY_LIMIT),
    },
    isRecord,
    previous,
  };
}
