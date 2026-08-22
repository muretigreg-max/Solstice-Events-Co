'use strict';

/**
 * A tiny keyed mutex.
 *
 * The supplier can fire webhooks close together (a burst of stock changes),
 * and Node will happily start handling a second request before the first
 * has finished writing `inventory.json`. Without serializing access, two
 * concurrent webhook handlers could both read the file, both compute their
 * diff against the same stale snapshot, and the second write would clobber
 * the first. This mutex makes every read-modify-write against the store
 * strictly sequential.
 *
 * A single fixed key ("inventory") is used throughout this project, since
 * there's one shared store file - but the mutex is written generically in
 * case a future per-supplier or per-warehouse store makes per-key locking
 * useful.
 */
class KeyedMutex {
  constructor() {
    /** @type {Map<string, Promise<void>>} */
    this._tails = new Map();
  }

  async runExclusive(key, fn) {
    const previousTail = this._tails.get(key) || Promise.resolve();
    const run = previousTail.then(() => fn(), () => fn());
    this._tails.set(key, run.then(() => undefined, () => undefined));
    return run;
  }
}

module.exports = { KeyedMutex };
