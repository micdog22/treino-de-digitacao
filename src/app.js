import {
  ABNT2_ROWS, LIMITS, MODES, TypingSession, accuracy, addResult, buildText, charName, charsMatch,
  emptyStore, findLimit, mulberry32, parseStore, recordKey, toNFC, wpm,
} from './typing.js';

const STORE_KEY = 'treino-de-digitacao:v1';
const SETTINGS_KEY = 'treino-de-digitacao:config';
const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];

const $ = (id) => document.getElementById(id);
const els = {
  modes: document.querySelectorAll('input[name="modo"]'),
  limit: $('limite'),
  ignoreAccents: $('ignorar-acentos'),
  area: $('area'),
  input: $('entrada'),
  lines: $('texto-linhas'),
  focusHint: $('aviso-foco'),
  reader: $('texto-leitor'),
  progressLabel: $('vivo-rotulo'),
  progress: $('vivo-progresso'),
  livePpm: $('vivo-ppm'),
  liveAccuracy: $('vivo-precisao'),
  notice: $('aviso'),
  newText: $('novo-texto'),
  restart: $('recomecar'),
  results: $('resultado'),
  resultsTitle: $('resultado-titulo'),
  message: $('r-mensagem'),
  ppm: $('r-ppm'),
  accuracy: $('r-precisao'),
  errors: $('r-erros'),
  consistency: $('r-consistencia'),
  time: $('r-tempo'),
  details: $('r-detalhes'),
  missed: $('r-teclas'),
  keyboard: $('teclado'),
  again: $('r-repetir'),
  next: $('r-novo'),
  record: $('recorde'),
  history: $('historico'),
  historyEmpty: $('historico-vazio'),
  clearHistory: $('limpar-historico'),
};

const fmt0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fmtDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

let settings = { mode: 'palavras', limitId: 'tempo-30', ignoreAccents: false };
let store = emptyStore();
let session = null;
let text = '';
let spans = [];
let states = [];
let caret = -1;
let timer = null;
let noticeTimer = null;
let clearArmed = false;

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem localStorage (modo privado, por exemplo): o treino funciona, só não salva.
  }
}

function randomSeed() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function notice(message) {
  els.notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { els.notice.textContent = ''; }, 3500);
}

// ---------- configurações ----------

function loadSettings() {
  try {
    const saved = JSON.parse(storageGet(SETTINGS_KEY) || '{}');
    if (MODES[saved.mode]) settings.mode = saved.mode;
    if (LIMITS.some((l) => l.id === saved.limitId)) settings.limitId = saved.limitId;
    settings.ignoreAccents = saved.ignoreAccents === true;
  } catch {
    // Configuração inválida: fica a padrão.
  }
  for (const radio of els.modes) radio.checked = radio.value === settings.mode;
  els.limit.value = settings.limitId;
  els.ignoreAccents.checked = settings.ignoreAccents;
}

function saveSettings() {
  storageSet(SETTINGS_KEY, JSON.stringify(settings));
}

// ---------- texto na tela ----------

function renderText() {
  const fragment = document.createDocumentFragment();
  spans = session.target.map((char) => {
    const span = el('span', char === ' ' ? 'ch sp' : 'ch', char);
    span.dataset.state = 'pending';
    fragment.append(span);
    return span;
  });
  els.lines.replaceChildren(fragment);
  states = spans.map(() => 'pending');
  caret = -1;
  els.reader.textContent = `Texto para digitar: ${text}`;
  paint(session.typed);
}

// `shown` são os caracteres na tela; a partir de `composingFrom` é um acento ainda sendo composto.
function paint(shown, composingFrom = shown.length) {
  const { target, ignoreAccents } = session;
  for (let i = 0; i < target.length; i++) {
    let state = 'pending';
    if (i < shown.length) {
      if (i >= composingFrom) state = 'composing';
      else state = charsMatch(shown[i], target[i], ignoreAccents) ? 'correct' : 'incorrect';
    }
    if (state !== states[i]) {
      spans[i].dataset.state = state;
      states[i] = state;
    }
  }
  const nextCaret = session.finished ? -1 : Math.min(shown.length, target.length);
  if (nextCaret !== caret) {
    spans[caret]?.classList.remove('caret');
    spans[nextCaret]?.classList.add('caret');
    caret = nextCaret;
  }
  keepCaretLineVisible();
}

// Mostra três linhas e rola para a linha do cursor ficar sempre na segunda.
function keepCaretLineVisible() {
  const reference = spans[caret] || spans[spans.length - 1];
  if (!reference) return;
  const lineHeight = parseFloat(getComputedStyle(els.lines).lineHeight) || 40;
  const offset = Math.max(0, reference.offsetTop - lineHeight);
  els.lines.style.transform = offset ? `translateY(${-offset}px)` : '';
}

// ---------- andamento ----------

function updateLive(now = performance.now()) {
  const limit = findLimit(settings.limitId);
  if (limit.type === 'time') {
    const left = Math.max(0, limit.value * 1000 - session.elapsed(now));
    els.progress.textContent = `${Math.ceil(left / 1000)} s`;
  } else {
    els.progress.textContent = `${session.wordsDone()}/${session.totalWords()}`;
  }
  const ms = session.elapsed(now);
  const keys = session.keystrokes;
  els.livePpm.textContent = ms >= 1000 ? fmt0.format(wpm(session.correctCount(), ms)) : '-';
  els.liveAccuracy.textContent = keys.length ? `${fmt0.format(accuracy(keys.filter((k) => k.correct).length, keys.length))}%` : '-';
}

function startTimer() {
  if (!timer) timer = setInterval(tick, 100);
}

function stopTimer() {
  clearInterval(timer);
  timer = null;
}

function tick() {
  const now = performance.now();
  if (session.timeUp(now)) finish(now);
  else updateLive(now);
}

function newText(sameText = false) {
  stopTimer();
  if (!sameText || !text) {
    text = buildText({ mode: settings.mode, limitId: settings.limitId, rng: mulberry32(randomSeed()) });
  }
  const limit = findLimit(settings.limitId);
  session = new TypingSession(text, {
    ignoreAccents: settings.ignoreAccents,
    durationMs: limit.type === 'time' ? limit.value * 1000 : null,
  });
  els.input.disabled = false;
  els.input.value = '';
  els.input.maxLength = session.target.length;
  els.results.hidden = true;
  els.focusHint.textContent = 'Clique aqui ou toque para digitar';
  els.progressLabel.textContent = limit.type === 'time' ? 'Tempo' : 'Palavras';
  renderText();
  updateLive();
}

function focusInput() {
  if (els.input.disabled) return;
  els.input.focus({ preventScroll: true });
  const end = els.input.value.length;
  els.input.setSelectionRange(end, end);
}

// Valor confirmado (sem acento pendente): conta as teclas e atualiza a tela.
function commit() {
  if (!session || session.finished) return;
  const now = performance.now();
  if (session.timeUp(now)) {
    finish(now);
    return;
  }
  session.update(els.input.value, now);
  const accepted = session.typed.join('');
  if (els.input.value !== accepted) els.input.value = accepted;
  if (session.started) startTimer();
  paint(session.typed);
  updateLive(now);
  if (session.finished) finish(now);
}

// Acento sendo composto (tecla morta): só mostra, ainda não conta como tecla.
function showComposition() {
  if (!session || session.finished) return;
  session.start(performance.now());
  startTimer();
  const preview = Array.from(toNFC(els.input.value)).slice(0, session.target.length);
  let same = 0;
  while (same < preview.length && same < session.typed.length && preview[same] === session.typed[same]) same += 1;
  paint(preview, same);
}

// ---------- resultado ----------

const keyLabel = (key) => (key === 'space' ? 'espaço' : key.toUpperCase());

function renderKeyboard(heat) {
  const max = Math.max(0, ...heat.values());
  const rows = ABNT2_ROWS.map((row, index) => {
    const line = el('div', `kb-row kb-row-${index}`);
    for (const key of row) {
      const count = heat.get(key) || 0;
      const level = count ? Math.max(1, Math.ceil((count / max) * 4)) : 0;
      const cap = el('span', `kb-key level-${level}${key === 'space' ? ' kb-space' : ''}`, keyLabel(key));
      cap.title = `${keyLabel(key)}: ${count} ${count === 1 ? 'erro' : 'erros'}`;
      line.append(cap);
    }
    return line;
  });
  els.keyboard.replaceChildren(...rows);
  const summary = [...heat.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => `${keyLabel(key)}: ${count}`);
  els.keyboard.setAttribute('aria-label', summary.length
    ? `Mapa de erros no teclado ABNT2. ${summary.join(', ')}.`
    : 'Mapa de erros no teclado ABNT2: nenhum erro.');
}

function renderMissed(missed) {
  const items = missed.map(({ char, count }) => {
    const li = el('li');
    li.append(el('kbd', '', charName(char)), ` ${count} ${count === 1 ? 'erro' : 'erros'}`);
    return li;
  });
  if (!items.length) items.push(el('li', 'none', 'Nenhum erro. Parabéns!'));
  els.missed.replaceChildren(...items);
}

function encouragement(result, outcome) {
  if (outcome.isRecord && outcome.previous) {
    return `Novo recorde nesta configuração! O anterior era ${fmt0.format(outcome.previous.ppm)} PPM.`;
  }
  if (outcome.isRecord) return 'Primeiro resultado nesta configuração. Agora é tentar superar!';
  if (result.accuracy >= 97) return 'Precisão excelente. Que tal tentar um pouco mais rápido?';
  if (result.accuracy < 90) return 'Vá com calma: precisão primeiro, a velocidade vem com o tempo.';
  return 'Bom treino! Continue praticando um pouco todo dia.';
}

function finish(now = performance.now()) {
  stopTimer();
  session.finish(now);
  paint(session.typed);
  updateLive(now);
  els.input.blur();
  els.input.disabled = true;
  els.focusHint.textContent = 'Treino concluído. Clique aqui ou aperte Esc para um novo texto.';
  const result = session.results(now);

  // Os mesmos valores arredondados vão para a tela e para o histórico.
  const ppm = Math.round(result.ppm);
  const acc = Math.round(result.accuracy * 10) / 10;
  els.ppm.textContent = fmt0.format(ppm);
  els.accuracy.textContent = `${fmt1.format(acc)}%`;
  els.errors.textContent = String(result.errors);
  els.consistency.textContent = result.consistency === null ? '-' : `${fmt0.format(result.consistency)}%`;
  els.time.textContent = `${fmt1.format(result.elapsedMs / 1000)} s`;
  els.details.textContent = `${result.correctChars} caracteres certos de ${result.typedChars} digitados no texto final · `
    + `${result.keystrokes} teclas · PPM bruto (todas as teclas): ${fmt0.format(result.rawPpm)}`;
  renderMissed(result.missed);
  renderKeyboard(result.heat);

  let outcome = { isRecord: false, previous: null };
  if (result.keystrokes > 0 && result.elapsedMs > 0) {
    outcome = addResult(store, {
      date: new Date().toISOString(),
      mode: settings.mode,
      limitId: settings.limitId,
      ignoreAccents: settings.ignoreAccents,
      ppm,
      accuracy: acc,
      errors: result.errors,
      consistency: result.consistency === null ? null : Math.round(result.consistency),
    });
    store = outcome.store;
    storageSet(STORE_KEY, JSON.stringify(store));
    renderHistory();
  }
  els.message.textContent = encouragement(result, outcome);
  els.results.hidden = false;
  els.resultsTitle.focus();
}

// ---------- histórico ----------

function describeConfig(entry) {
  const accents = entry.ignoreAccents ? ' · sem acentos' : '';
  return `${MODES[entry.mode]} · ${findLimit(entry.limitId).label}${accents}`;
}

function renderHistory() {
  const best = store.records[recordKey(settings)];
  els.record.textContent = best
    ? `Recorde em ${describeConfig(best)}: ${fmt0.format(best.ppm)} PPM, com ${fmt1.format(best.accuracy)}% de precisão (${fmtDate.format(new Date(best.date))}).`
    : `Ainda não há recorde em ${describeConfig(settings)}.`;
  const rows = store.history.slice(0, 10).map((entry) => {
    const tr = el('tr');
    tr.append(
      el('td', '', fmtDate.format(new Date(entry.date))),
      el('td', '', `${MODES[entry.mode]}${entry.ignoreAccents ? ' (sem acentos)' : ''}`),
      el('td', '', findLimit(entry.limitId).label),
      el('td', 'num', fmt0.format(entry.ppm)),
      el('td', 'num', `${fmt1.format(entry.accuracy)}%`),
    );
    return tr;
  });
  els.history.replaceChildren(...rows);
  els.historyEmpty.hidden = rows.length > 0;
  els.clearHistory.hidden = rows.length === 0;
}

// ---------- eventos ----------

function bindEvents() {
  els.input.addEventListener('beforeinput', (event) => {
    if (!session || session.finished) {
      event.preventDefault();
      return;
    }
    if (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') {
      event.preventDefault();
      notice('Colar texto não vale no treino. 😉');
    } else if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') {
      event.preventDefault();
    }
  });
  els.input.addEventListener('input', (event) => {
    if (event.isComposing) showComposition();
    else commit();
  });
  els.input.addEventListener('compositionend', commit);
  els.input.addEventListener('paste', (event) => event.preventDefault());
  els.input.addEventListener('drop', (event) => event.preventDefault());
  els.input.addEventListener('keydown', (event) => {
    if (NAV_KEYS.includes(event.key)) event.preventDefault();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') event.preventDefault();
  });
  els.input.addEventListener('select', () => {
    const end = els.input.value.length;
    if (els.input.selectionStart !== end) els.input.setSelectionRange(end, end);
  });
  els.area.addEventListener('click', () => {
    if (session?.finished) newText();
    focusInput();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      newText();
      focusInput();
    }
  });

  for (const radio of els.modes) {
    radio.addEventListener('change', () => {
      settings.mode = radio.value;
      saveSettings();
      newText();
      renderHistory();
    });
  }
  els.limit.addEventListener('change', () => {
    settings.limitId = els.limit.value;
    saveSettings();
    newText();
    renderHistory();
  });
  els.ignoreAccents.addEventListener('change', () => {
    settings.ignoreAccents = els.ignoreAccents.checked;
    saveSettings();
    newText(true);
    renderHistory();
  });

  const fresh = () => { newText(); focusInput(); };
  const same = () => { newText(true); focusInput(); };
  els.newText.addEventListener('click', fresh);
  els.next.addEventListener('click', fresh);
  els.restart.addEventListener('click', same);
  els.again.addEventListener('click', same);

  els.clearHistory.addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      els.clearHistory.textContent = 'Clique de novo para confirmar';
      setTimeout(() => {
        clearArmed = false;
        els.clearHistory.textContent = 'Limpar histórico';
      }, 4000);
      return;
    }
    clearArmed = false;
    els.clearHistory.textContent = 'Limpar histórico';
    store = emptyStore();
    storageSet(STORE_KEY, JSON.stringify(store));
    renderHistory();
    notice('Histórico e recordes apagados.');
  });

  window.addEventListener('resize', keepCaretLineVisible);
}

function init() {
  loadSettings();
  store = parseStore(storageGet(STORE_KEY) || '');
  bindEvents();
  newText();
  renderHistory();
  focusInput();
}

init();
