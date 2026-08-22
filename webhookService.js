'use strict';

 *  3. Every write goes through a mutex so concurrent webhook deliveries
 *     can't race each other into a lost update.
 */
class WebhookService {
  constructor({ store, mutex }) {
    this._store = store;
    this._mutex = mutex;
  }

  /**
   * @param {{ eventId: string, timestamp: string, supplier?: string, items: Record<string, number> }} event
   * @returns {{ httpStatus: number, body: object }}
   */
  async handleInventoryEvent(event) {
    const { eventId, timestamp, items } = event;

    if (!eventId || !timestamp || !items || typeof items !== 'object') {
      return { httpStatus: 400, body: { error: 'invalid_event_payload' } };
    }

    return this._mutex.runExclusive('inventory', async () => {
      if (this._store.hasProcessedEvent(eventId)) {
        return {
          httpStatus: 200,
          body: { ignored: true, reason: 'duplicate_event_id', eventId },
        };
      }

      const applied = [];
      const staleSkipped = [];

      for (const [sku, newQty] of Object.entries(items)) {
        const lastAppliedAt = this._store.getSkuLastAppliedAt(sku);

        if (lastAppliedAt && new Date(timestamp) <= new Date(lastAppliedAt)) {
          // This SKU's update is older than (or the same age as) what we
          // already applied - an out-of-order delivery. Skip just this
          // SKU; other SKUs in the same event may still be newer and are
          // evaluated independently.
          staleSkipped.push({ sku, reason: 'stale_relative_to_last_applied', lastAppliedAt });
          continue;
        }

        const oldQty = this._store.getQuantity(sku);
        this._store.applySkuUpdate(sku, newQty, timestamp);

        if (oldQty === undefined) {
          applied.push(`${sku}: initial stock recorded at ${newQty}`);
        } else if (oldQty !== newQty) {
          applied.push(`${sku}: ${oldQty} -> ${newQty}`);
        }
        // oldQty === newQty: quantity unchanged, nothing to log, but the
        // SKU's lastAppliedAt still advances so a genuinely later event
        // reporting the same value doesn't get treated as stale later.
      }

      this._store.recordEventProcessed(eventId, timestamp, applied);
      this._store.persist();

      return {
        httpStatus: 200,
        body: {
          eventId,
          applied,
          staleSkipped,
        },
      };
    });
  }

  getSnapshot() {
    return this._store.snapshot();
  }
}

module.exports = { WebhookService };
