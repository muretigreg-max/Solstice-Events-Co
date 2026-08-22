'use strict';

const express = require('express');
const { InventoryStore } = require('./store/inventoryStore');
const { KeyedMutex } = require('./utils/keyedMutex');
const { WebhookService } = require('./services/webhookService');
const { buildWebhookRouter } = require('./routes/webhookRoutes');

const DEFAULT_SHARED_SECRET = process.env.WEBHOOK_SHARED_SECRET || 'supplier-shared-secret';

/**
 * Build a fully wired Express app.
 *
 * @param {object} [opts]
 * @param {string} [opts.storePath] path to the JSON store file
 * @param {string} [opts.sharedSecret] HMAC secret shared with the supplier
 * @returns {{ app: import('express').Express, webhookService: WebhookService }}
 */
function buildApp({ storePath, sharedSecret = DEFAULT_SHARED_SECRET } = {}) {
  if (!storePath) {
    throw new Error('buildApp requires a storePath');
  }

  const store = new InventoryStore(storePath);
  const mutex = new KeyedMutex();
  const webhookService = new WebhookService({ store, mutex });

  const app = express();
  app.use(buildWebhookRouter(webhookService, sharedSecret));

  app.get('/health', (req, res) => res.status(200).json({ ok: true }));
  app.get('/inventory', (req, res) => res.status(200).json(webhookService.getSnapshot()));

  return { app, webhookService };
}

module.exports = { buildApp, DEFAULT_SHARED_SECRET };
