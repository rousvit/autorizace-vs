// Testy logiky aplikace bez prohlížeče:  node tools/test_logic.mjs
// Ověřuje losování zkoušky, hodnocení podle pokynů AR ČKAIT, opakování v rozestupech a vyhledávání.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');

// --- minimální prostředí prohlížeče ---------------------------------------------------------
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener: () => {}, getElementById: () => null, visibilityState: 'visible' };
globalThis.fetch = async (url) => {
  const body = readFileSync(path.join(docs, url), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body) };
};

const imp = (p) => import(pathToFileURL(path.join(docs, 'js', p)).href);
const store = await imp('store.js');
const data = await imp('data.js');
const srs = await imp('srs.js');
const exam = await imp('views/exam.js');

store.load();
const D = await data.loadQuestions();
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`✓ ${name}`); };

test('data: 460 otázek, 357 obecných, 103 oborových, všechny s variantami a/b/c', () => {
  assert.equal(D.questions.length, 460);
  assert.equal(D.general.length, 357);
  assert.equal(D.specific.length, 103);
  for (const q of D.questions) {
    assert.ok(q.d && q.d.length === 2, `${q.id} bez variant`);
    assert.notEqual(q.d[0], q.d[1], `${q.id}: shodné varianty`);
    assert.ok(!q.d.includes(q.a), `${q.id}: varianta = správná odpověď`);
    assert.ok(q.refs && q.refs.length, `${q.id} bez odkazů`);
  }
});

test('zkouška: 20 obecných + 10 oborových, bez opakování, z mnoha okruhů', () => {
  for (let i = 0; i < 300; i++) {
    const e = exam.newExam();
    assert.equal(e.items.length, 30);
    const g = e.items.filter((x) => x.part === 'obecna');
    const s = e.items.filter((x) => x.part === 'oborova');
    assert.equal(g.length, 20);
    assert.equal(s.length, 10);
    assert.equal(new Set(e.items.map((x) => x.id)).size, 30);
    for (const it of e.items) {
      assert.equal(data.question(it.id).part, it.part);
      assert.deepEqual([...it.order].sort(), [0, 1, 2]);
    }
    const okruhyG = new Set(g.map((x) => data.question(x.id).okruh));
    const okruhyS = new Set(s.map((x) => data.question(x.id).okruh));
    assert.ok(okruhyG.size >= 11, `obecná část jen z ${okruhyG.size} okruhů`);
    assert.ok(okruhyS.size >= 6, `oborová část jen z ${okruhyS.size} okruhů`);
  }
});

test('hodnocení: prahy 80 % / 51–79 % / ≤ 50 % zvlášť pro obě části', () => {
  const make = (g, s) => {
    const e = exam.newExam();
    let gi = 0;
    let si = 0;
    e.items.forEach((it, i) => {
      const correct = it.order.indexOf(0);
      const wrong = it.order.findIndex((x) => x !== 0);
      if (it.part === 'obecna') e.answers[i] = gi++ < g ? correct : wrong;
      else e.answers[i] = si++ < s ? correct : wrong;
    });
    return exam.evaluate(e);
  };
  const cases = [
    [20, 10, 'ok'], [16, 8, 'ok'], [15, 8, 'mid'], [16, 7, 'mid'], [11, 6, 'mid'],
    [10, 10, 'bad'], [20, 5, 'bad'], [16, 6, 'mid'], [0, 0, 'bad'],
  ];
  for (const [g, s, v] of cases) {
    const r = make(g, s);
    assert.equal(r.g, g);
    assert.equal(r.s, s);
    assert.equal(r.verdict, v, `${g}/20 a ${s}/10 → ${r.verdict}, čekáno ${v}`);
  }
});

test('opakování: přihrádky a termíny po odpovědích', () => {
  const id = 'A1';
  let p = srs.grade(id, srs.GRADE.OK, 'card');
  assert.equal(p.b, 2);
  p = srs.grade(id, srs.GRADE.OK, 'card');
  assert.equal(p.b, 3);
  p = srs.grade(id, srs.GRADE.BAD, 'card');
  assert.equal(p.b, 0);
  assert.ok(p.due - Date.now() <= 2 * 60 * 1000 + 50);
  p = srs.grade('A2', srs.GRADE.OK, 'abc');
  assert.equal(p.b, 1, 'trefa nové otázky v a/b/c může být tip → jen 1 den');
  assert.equal(srs.status('A1'), 'learning');
  assert.equal(srs.status('A3'), 'new');
});

test('fronta kartiček: denní limit nových počítá jen kartičky', () => {
  const before = srs.newSeenToday();
  srs.grade('B6', srs.GRADE.OK, 'exam');
  assert.equal(srs.newSeenToday(), before, 'odpověď ze zkoušky nesmí čerpat limit');
  const q = srs.buildQueue(D.questions, { size: 20, newLimit: before + 3 });
  const fresh = q.queue.filter((x) => !store.progress(x.id)?.n);
  assert.ok(fresh.length <= 3);
});

test('odhad připravenosti: nic neumím → téměř nulová šance, vše zvládnuto → vysoká', () => {
  const r0 = srs.readiness(D.general.slice(50), D.specific.slice(20));
  assert.ok(r0.pass < 0.01);
  for (const q of D.questions) store.get().progress[q.id] = { b: 5, n: 3, ok: 3, bad: 0, mid: 0, due: Date.now() + 1e9 };
  const r1 = srs.readiness(D.general, D.specific);
  assert.ok(r1.pass > 0.9, `šance ${r1.pass}`);
  store.reset();
});

test('vyhledávání: skloňování a diakritika', () => {
  const ids = data.search('ochranne pasmo').map((q) => q.id);
  for (const id of ['M9', 'M10', 'M19', 'P7']) assert.ok(ids.includes(id), `chybí ${id}`);
  assert.ok(data.search('vodní dílo').length >= 5);
  assert.ok(data.search('§ 55').some((q) => q.id === 'M7'));
});

console.log(`\n${passed} testů prošlo`);
