// Runs the exact language check off the main thread, so an expensive machine cannot
// freeze the editor. The page terminates this worker to cancel a check in flight.

import {check, levels} from './automata.js';

self.onmessage = ({data}) => {
  try {
    self.postMessage(check(data.machine, levels[data.levelIndex]));
  } catch {
    // Never report a verdict we did not actually reach.
    self.postMessage({error: 'The checker could not finish. No correctness verdict was made.'});
  }
};
