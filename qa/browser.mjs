// Optional browser regression suite. Requires Playwright and a server on port 4173:
//
//   node server.mjs                       # in one terminal
//   node qa/browser.mjs                   # in another
//
// PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE override where Playwright and Chromium come
// from. The script asserts as it goes and throws on the first failure; it also writes
// demo-nfa.png and demo-mobile.png to the project root.

import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {levels} from '../challenges.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

/** Explores a level's reference machine into a laid-out DFA the editor can load. */
function referenceMachine(level) {
  const states = [level.start];
  const indexByKey = new Map([[JSON.stringify(level.start), 0]]);
  const nodes = [];
  const edges = [];

  for (let i = 0; i < states.length; i++) {
    nodes.push({id: i, x: 430 + (i % 5) * 180, y: 220 + Math.floor(i / 5) * 220, accept: level.accepts(states[i])});
    for (const symbol of level.alphabet) {
      const next = level.next(states[i], symbol);
      const key = JSON.stringify(next);
      if (!indexByKey.has(key)) {
        indexByKey.set(key, states.length);
        states.push(next);
      }
      edges.push({from: i, to: indexByKey.get(key), symbol});
    }
  }
  return {mode: 'DFA', alphabet: level.alphabet, start: 0, nodes, edges};
}

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  headless: true
});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});

const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:4173');

// ───────────────────────────────── Helpers ─────────────────────────────────

/** Writes a session into localStorage and reloads so the app picks it up. */
async function seed(session) {
  await page.evaluate(value => localStorage.setItem('dfa-kitchen-v2', JSON.stringify(value)), session);
  await page.reload();
}

const waitForResult = expected =>
  page.waitForFunction(text => document.querySelector('#result strong').textContent === text, expected);

const stateBody = id => page.locator(`.state[data-id="${id}"] .body`);
const edgeLabelCount = () => page.locator('.edge-label').count();
const activeStateIds = () =>
  page.locator('.state.active').evaluateAll(nodes => nodes.map(node => Number(node.dataset.id)));

/** Drives the connect tool: source, destination, then the arrow label. */
async function connect(from, to, symbol) {
  await stateBody(from).click();
  await stateBody(to).click();
  await page.locator(`[data-symbol="${symbol}"]`).click();
}

const screenshot = name =>
  page.screenshot({path: fileURLToPath(new URL(`../${name}`, import.meta.url)), fullPage: true});

// ───────────────── Every challenge, in both modes, through the UI ─────────────────

const drafts = Object.fromEntries(levels.map(level => [level.id, referenceMachine(level)]));
await seed({levelIndex: 0, drafts, collapsed: false});
assert.equal(await page.locator('#level option').count(), 20);

// The collapsed panel survives a reload.
await page.locator('#toggle-challenge').click();
assert.equal(await page.locator('#challenge-body').isVisible(), false);
await page.reload();
assert.equal(await page.locator('#challenge-body').isVisible(), false);
await page.locator('#toggle-challenge').click();

for (let i = 0; i < levels.length; i++) {
  await page.locator('#level').selectOption(String(i));
  assert.equal(await page.locator('#rule').innerText(), levels[i].rule);
  assert.deepEqual(await page.locator('#alphabet-symbols span').allTextContents(), levels[i].alphabet);

  for (const mode of ['DFA', 'NFA']) {
    await page.locator('#mode').selectOption(mode);
    await page.locator('#check').click();
    await waitForResult('Perfect recipe. You did it!');
    await page.locator('#run').click();
    await waitForResult('String accepted.');
  }
}
console.log('PASS: all 20 challenges exact-checked and sample-run via UI in both modes.');

// ─────────── NFA branching, dying branches, ε-cycles, and DFA refusal ───────────

// q0 and q1 are joined by ε in both directions, and q1 branches on 0 to an accepting q2
// and a dead-end q3.
const branching = {
  mode: 'NFA',
  alphabet: ['0', '1'],
  start: 0,
  nodes: [
    {id: 0, x: 400, y: 330, accept: false},
    {id: 1, x: 630, y: 330, accept: false},
    {id: 2, x: 930, y: 210, accept: true},
    {id: 3, x: 930, y: 470, accept: false}
  ],
  edges: [
    {from: 0, to: 1, symbol: 'ε'},
    {from: 1, to: 0, symbol: 'ε'},
    {from: 1, to: 2, symbol: '0'},
    {from: 1, to: 3, symbol: '0'},
    {from: 2, to: 2, symbol: '1'}
  ]
};

await seed({levelIndex: 0, drafts: {'ends-1': branching}, collapsed: false});
await page.locator('#test-input').fill('01');
await page.locator('#step').click();
await page.waitForFunction(() => !document.querySelector('#step').disabled);
assert.deepEqual(await activeStateIds(), [2, 3]);
await screenshot('demo-nfa.png');

// The second symbol kills the q3 branch but not the q2 one.
await page.locator('#step').click();
await waitForResult('String accepted.');
assert.deepEqual(await activeStateIds(), [2]);
assert.equal(await page.locator('.state[data-id="3"]').evaluate(node => node.classList.contains('dead')), true);

// With every branch dead, the string is rejected and nothing stays highlighted.
await page.locator('#test-input').fill('00');
await page.locator('#run').click();
await waitForResult('String rejected.');
assert.equal(await page.locator('.state.active').count(), 0);

// Switching a branching ε-NFA to DFA is refused, and the graph is left alone.
await page.locator('#mode').selectOption('DFA');
assert.equal(await page.locator('#mode').inputValue(), 'NFA');
assert.match(await page.locator('#toast').innerText(), /Cannot switch/);

// An ε-reachable accepting state accepts the empty string.
await page.locator('[data-tool="select"]').click();
await stateBody(1).click();
await page.locator('#accepting').check();
await page.locator('#test-input').fill('');
await page.locator('#run').click();
await waitForResult('String accepted.');

// ───────────────── Alphabet isolation and per-challenge drafts ─────────────────

await page.locator('#level').selectOption('16');
assert.equal(await page.locator('.state').count(), 0);
assert.deepEqual(await page.locator('[data-symbol]').allTextContents(), ['a', 'b', 'c']);
await page.locator('#mode').selectOption('NFA');
assert.deepEqual(await page.locator('[data-symbol]').allTextContents(), ['a', 'b', 'c', 'ε']);
await page.locator('#test-input').fill('010');
await page.locator('#run').click();
assert.match(await page.locator('#result').innerText(), /Invalid input/);

// The first challenge's draft, and its mode, are still there.
await page.locator('#level').selectOption('0');
assert.equal(await page.locator('.state').count(), 4);
assert.equal(await page.locator('#mode').inputValue(), 'NFA');

// ───────── The connection editor allows branching and ε, but not duplicates ─────────

await page.locator('[data-tool="connect"]').click();
await connect(0, 2, '0');
const baseline = await edgeLabelCount();

await connect(0, 3, '0');  // NFA branching on the same symbol is allowed
assert.equal(await edgeLabelCount(), baseline + 1);

await connect(0, 3, '0');  // but an identical arrow is not
assert.equal(await edgeLabelCount(), baseline + 1);
assert.match(await page.locator('#toast').innerText(), /already exists/);
await page.keyboard.press('Escape');

await connect(3, 3, 'ε');  // self-loops and ε are both available
assert.equal(await edgeLabelCount(), baseline + 2);

// Mode and edits survive a reload.
await page.reload();
assert.equal(await page.locator('#mode').inputValue(), 'NFA');
assert.equal(await edgeLabelCount(), baseline + 2);

// ───────── Concurrent motion, step locking, and cancellation mid-flight ─────────

await seed({levelIndex: 0, drafts: {'ends-1': branching}, collapsed: false});
await page.emulateMedia({reducedMotion: 'no-preference'});

await page.locator('#test-input').fill('01');
await page.locator('#step').click();
// Both branches animate at once, and both buttons stay locked until they land.
await page.waitForFunction(() => document.querySelectorAll('#travelers circle').length === 2);
assert.equal(await page.locator('#step').isDisabled(), true);
assert.equal(await page.locator('#run').isDisabled(), true);
await page.waitForFunction(() => !document.querySelector('#step').disabled);
assert.deepEqual(await activeStateIds(), [2, 3]);

// Clearing the canvas mid-animation cancels playback cleanly.
await page.locator('#step').click();
await page.waitForFunction(() => document.querySelectorAll('#travelers circle').length === 1);
await page.locator('#clear').click();
await page.waitForTimeout(650);
assert.equal(await page.locator('.state').count(), 0);
assert.equal(await page.locator('#travelers circle').count(), 0);
assert.match(await page.locator('#result').innerText(), /Ready when you are/);

await page.locator('#undo').click();
assert.equal(await page.locator('.state').count(), 4);
console.log('PASS: simultaneous animated branch tokens, locked stepping, and clean cancellation during playback.');

// ───────────────────────────── Mobile layout ─────────────────────────────

await page.setViewportSize({width: 390, height: 844});
await page.locator('#fit-view').click();
await screenshot('demo-mobile.png');
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await page.locator('#toggle-challenge').click();
assert.equal(await page.locator('#challenge-body').isVisible(), false);

assert.deepEqual(errors, []);
console.log('PASS: collapse persistence, NFA branching/death, epsilon cycles/empty input, DFA restrictions, alphabets, drafts, editor duplicate handling, persistence, mobile layout, no browser errors.');
await browser.close();
