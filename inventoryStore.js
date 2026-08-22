'use strict';

const fs = require('fs');

const MAX_TRACKED_EVENT_IDS = 200; // cap so this never grows unbounded

/**
 * File-backed inventory store.
 *
 * Carries over the original poller's on-disk shape (`items`, `lastSynced`,
 * `changeLog`) unchanged, so existing `inventory.json` history from the
 * polling era still loads. Two fields are new, added for the webhook pivot:
 *
 *   - `skuLastAppliedAt`: the timestamp of the most recent event actually
 *     applied to each SKU. This is what makes out-of-order webhook delivery
 *     safe - see `applySkuUpdate` below.
 *   - `processedEventIds`: a capped list of the most recent event ids we've
 *     already applied, so an exact redelivery of the same webhook (the
 *     vendor's at-least-once retry behavior) is recognized and ignored
 *     before it's evaluated SKU by SKU.
 *
 * Swap-out point: replace with a real database-backed implementation as
 * long as it preserves this method contract; nothing else in the codebase
 * reads or writes the file directly.
 */
class InventoryStore {
  constructor(storePath) {
    this._path = storePath;
    this._data = this._load();
  }

  _load() {
    if (!fs.existsSync(this._path)) {
      return {
        items: {},
        lastSynced: null,
        changeLog: [],
        skuLastAppliedAt: {},
        processedEventIds: [],
      };
    }
    const raw = JSON.parse(fs.readFileSync(this._path, 'utf8'));
    return {
      items: raw.items || {},
      lastSynced: raw.lastSynced || null,
      changeLog: raw.changeLog || [],
      skuLastAppliedAt: raw.skuLastAppliedAt || {},
      processedEventIds: raw.processedEventIds || [],
    };
  }

  _save() {
    fs.writeFileSync(this._path, JSON.stringify(this._data, null, 2));
  }

  hasProcessedEvent(eventId) {
    return this._data.processedEventIds.includes(eventId);
  }

  getSkuLastAppliedAt(sku) {
    return this._data.skuLastAppliedAt[sku] || null;
  }

  getQuantity(sku) {
    return this._data.items[sku];
  }

  /**
   * Apply one SKU's new quantity as of `timestamp`. Caller is responsible
   * for having already decided (via getSkuLastAppliedAt) that this update
   * is not stale/out-of-order relative to what's already applied.
   */
  applySkuUpdate(sku, newQty, timestamp) {
    const oldQty = this._data.items[sku];
    this._data.items[sku] = newQty;
    this._data.skuLastAppliedAt[sku] = timestamp;
    return oldQty;
  }

  recordEventProcessed(eventId, timestamp, changes) {
    this._data.processedEventIds.push(eventId);
    if (this._data.processedEventIds.length > MAX_TRACKED_EVENT_IDS) {
      this._data.processedEventIds = this._data.processedEventIds.slice(-MAX_TRACKED_EVENT_IDS);
    }
    this._data.lastSynced = timestamp;
    if (changes.length) {
      this._data.changeLog.push({ syncedAt: timestamp, changes });
    }
  }

  persist() {
    this._save();
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this._data));
  }
}

module.exports = { InventoryStore };
