# DFA Kitchen

A visual playground for constructing deterministic and nondeterministic finite automata. Includes 20 challenges over {0,1}, {a,b}, and {a,b,c}.

## Build and run

Prerequisites: Git, Node.js 18 or later, and a modern browser. This is a static HTML/CSS/JavaScript application using native ES modules and a Web Worker. **There is no compilation or bundling step**, and the app and logic tests require no installed packages.

```sh
git clone https://github.com/LuisJC-creator/DFA_Kitchen.git
cd DFA_Kitchen
node server.mjs
```

Open http://127.0.0.1:4173. Keep that terminal running; use Ctrl+C to stop it. If the repository is already cloned, start with `cd DFA_Kitchen`. Refresh an already-open browser tab after source changes. Serve the app over HTTP; opening `index.html` directly does not support its module/worker setup.

If npm is available, `npm start` is equivalent to `node server.mjs`. The server binds only to your computer's loopback address. If port 4173 is busy, stop the existing server before starting another instance.

In a second terminal, run the logic tests:

```sh
node --test
```

`npm test` is equivalent. No separate build output is generated: the HTML, CSS, and JavaScript source files are the application.

## Project structure

| Files | Purpose |
| --- | --- |
| `index.html`, `style.css` | Responsive editor, challenge panel, and simulation controls |
| `app.js` | Editor state and event wiring: editing, saved drafts, and animated DFA/NFA playback |
| `dom.js`, `shapes.js`, `geometry.js` | DOM helpers, the SVG for states and arrows, and the curve geometry behind them |
| `storage.js` | Per-challenge drafts and panel state in `localStorage` |
| `viewport.js` | Whiteboard panning, zooming, and fit-to-view |
| `challenges.js`, `references.js` | Twenty challenge definitions and finite reference-machine builders |
| `automata.js`, `checker.worker.js` | DFA/NFA execution and exact language checking in a worker |
| `automata.test.js`, `viewport.test.js` | Dependency-free logic and camera tests |
| `qa/browser.mjs` | Optional Playwright browser regression suite |
| `server.mjs`, `package.json` | Local HTTP server and convenience commands |
| `CHALLENGES.md` | Practice-sheet source mappings, assumptions, and validation scope |

## Editor

- Collapse or expand the challenge panel by clicking its heading. The setting persists.
- Choose a challenge and DFA/NFA mode. Each challenge stores its own draft; switching modes retains the graph when valid. Switching a branching or epsilon NFA to DFA is refused without altering it.
- **V / Move:** drag states; drag empty canvas to pan. Double-click a state to toggle acceptance.
- **S / Place state:** click empty space. The first state is the start state. New states reuse the lowest unused number.
- **C / Connect:** source, destination, symbol. Select the same state twice for a self-loop. Available labels follow the challenge alphabet; NFA mode also offers ε.
- **Escape / right-click:** cancel a pending connection.
- Click an arrow label to edit or delete it. Select a state to set the start state, acceptance, or delete it.
- **Ctrl/Cmd+Z:** undo graph edits and mode changes. Undo history is reset on challenge changes.
- **H / Pan, Space-drag, middle-mouse drag:** navigate without moving graph objects.
- **Scroll:** pan; Shift-scroll pans horizontally. Ctrl/Cmd-scroll or trackpad pinch zooms around the pointer. Fit recovers distant states; the percentage button restores 100% zoom.

## Simulation and semantics

Run an input string or step one symbol at a time. Empty input represents ε; do not type the ε glyph as an input symbol. Input must use the current alphabet.

**DFA:** each state has at most one outgoing arrow per symbol. Missing transitions behave as an implicit rejecting sink. This permits incomplete diagrams while preserving standard DFA language semantics.

**NFA:** multiple destinations for one symbol are permitted. Epsilon transitions consume no input. Simulation follows epsilon closure before input and after each symbol, animating epsilon waves separately. Epsilon cycles terminate through visited-state tracking. Matching transitions animate concurrently. Branch endpoints with no matching transition stop; other branches continue. Multiple paths reaching the same state merge visually into one active state. Acceptance requires at least one active accepting state after the entire input, including trailing epsilon moves. Reaching an accepting state before input ends is insufficient.

## Checking correctness

A breadth-first product search compares reachable player-state subsets against a reference DFA, returning a shortest counterexample or proving exact language equivalence. State names, arrangement, and number of states do not matter. Epsilon is never part of a returned counterexample's input alphabet.

The checker runs in a worker so the editor remains responsive. A 25,000-pair or 8-second limit returns **inconclusive**, never a win. Editing or switching challenges cancels an outdated check.

## Sources and validation

See [CHALLENGES.md](CHALLENGES.md) for source mappings, interpretations, and excluded practice problems. `node --test` runs 52 tests, including every reference language against independent string predicates, correct-machine equivalence, acceptance mutations, shortest counterexamples, epsilon cycles, branch death/merging, and 150 generated NFAs compared with independent path exploration.

Optional browser regression checks are in `qa/browser.mjs`. They need Playwright and a browser installed, and the local server running. Set `PLAYWRIGHT_MODULE` to an importable module name or file URL if it is not installed locally, and `BROWSER_EXECUTABLE` if using a system Chromium/Edge executable. Run `node qa/browser.mjs`; it uses an isolated browser context and never changes your open browser's drafts.

To install the optional browser-test tools locally without changing the project manifest or creating a lockfile, run:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
```

With the server running in another terminal:

```sh
node qa/browser.mjs
```

The browser suite checks all 20 challenges in both modes, simulation, collapse persistence, alphabets, branch death, epsilon cycles and empty input, editor restrictions, saved drafts, and mobile layout. Screenshots are written as `demo-*.png` and are ignored by Git.

## Storage and scope

Drafts and collapse state are saved in this browser's local storage. Version 1 data is migrated on first load. Reduced-motion preferences are respected. The interface uses SVG/CSS with optional Google Fonts and local fallbacks.

The demo prioritizes desktop pointer interaction. It includes mobile layout and pan/zoom; two-finger touchscreen gestures and automatic obstacle routing are not included. Each graph supports up to 40 states.
