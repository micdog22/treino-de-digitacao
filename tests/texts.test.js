import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAGRAPHS, SENTENCES, WORDS } from '../src/texts.js';

const all = [...WORDS, ...SENTENCES, ...PARAGRAPHS];

test('quantidades: cerca de 400 palavras, 60 frases e 12 textos', () => {
  assert.ok(WORDS.length >= 380 && WORDS.length <= 450, `palavras: ${WORDS.length}`);
  assert.ok(SENTENCES.length >= 55 && SENTENCES.length <= 70, `frases: ${SENTENCES.length}`);
  assert.ok(PARAGRAPHS.length >= 10 && PARAGRAPHS.length <= 15, `textos: ${PARAGRAPHS.length}`);
});

test('sem repetições', () => {
  assert.equal(new Set(WORDS).size, WORDS.length);
  assert.equal(new Set(SENTENCES).size, SENTENCES.length);
  assert.equal(new Set(PARAGRAPHS).size, PARAGRAPHS.length);
});

test('tudo está em NFC, sem espaços duplos nem nas pontas', () => {
  for (const text of all) {
    assert.equal(text, text.normalize('NFC'), text);
    assert.doesNotMatch(text, / {2}/, `espaço duplo: ${text}`);
    assert.equal(text, text.trim(), `espaço na ponta: ${text}`);
    assert.doesNotMatch(text, /[\t\n]/);
  }
});

test('palavras: minúsculas, só letras (com acento) e hífen', () => {
  for (const word of WORDS) {
    assert.match(word, /^[a-zà-öø-ÿç]+(-[a-zà-öø-ÿç]+)*$/, word);
    assert.equal(word, word.toLowerCase());
  }
});

test('boa parte das palavras tem acento ou cedilha', () => {
  const accented = WORDS.filter((w) => /[àáâãéêíóôõúüç]/.test(w));
  assert.ok(accented.length >= 100, `só ${accented.length} com acento`);
  for (const char of ['á', 'â', 'ã', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú', 'ç']) {
    assert.ok(WORDS.some((w) => w.includes(char)), `nenhuma palavra com ${char}`);
  }
});

test('frases e textos começam com maiúscula e terminam com pontuação', () => {
  for (const text of [...SENTENCES, ...PARAGRAPHS]) {
    assert.match(text, /^[A-ZÀ-Ý]/, text);
    assert.match(text, /[.!?]$/, text);
  }
  for (const paragraph of PARAGRAPHS) {
    for (const sentence of paragraph.split(/(?<=[.!?]) /)) assert.match(sentence, /^[A-ZÀ-Ý].*[.!?]$/, sentence);
  }
});

test('pontuação bem espaçada', () => {
  for (const text of [...SENTENCES, ...PARAGRAPHS]) {
    assert.doesNotMatch(text, / [,.!?;:]/, `espaço antes da pontuação: ${text}`);
    assert.doesNotMatch(text, /[,;:][^ ]/, `falta espaço depois da vírgula: ${text}`);
  }
});

test('sem caracteres que exigem acento solto ou aspas', () => {
  for (const text of all) assert.doesNotMatch(text, /["'`´~^¨“”‘’]/, text);
});

test('textos têm tamanho de parágrafo curto', () => {
  for (const paragraph of PARAGRAPHS) {
    const words = paragraph.split(' ').length;
    assert.ok(words >= 40 && words <= 80, `${words} palavras: ${paragraph.slice(0, 40)}`);
  }
});

test('ortografia atual em palavras que mudaram com o Acordo', () => {
  const text = all.join(' ');
  for (const old of ['idéia', 'vôo', 'tranqüilo', 'freqüente', 'cinqüenta', 'jóia', 'heróico', 'lêem', 'vêem', 'pára ']) {
    assert.ok(!text.includes(old), `grafia antiga: ${old}`);
  }
  for (const current of ['ideia', 'voo', 'tranquilo', 'frequente', 'cinquenta', 'joia', 'heroico', 'leem', 'veem']) {
    assert.ok(WORDS.includes(current), `falta ${current}`);
  }
});
