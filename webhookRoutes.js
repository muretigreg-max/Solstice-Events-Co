'use strict';

const express = require('express');
const { verifySignature } = require('../../signatureVerification');

/**
 * @param {import('../services/webhookService').WebhookService} webhookService
 * @param {string} sharedSecret
 */
function buildWebhookRouter(webhookService, sharedSecret) {
  const router = express.Router();

  // express.raw() (not express.json()) on this route specifically: HMAC
  // verification must run over the *exact bytes* the supplier signed.
  // Re-serializing a parsed object before verifying would silently break
  // verification the moment key order or whitespace differs.
  router.post(
    '/webhooks/inventory',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const rawBody = req.body; // Buffer, thanks to express.raw()
      const signature = req.header('X-Signature');

      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        return res.status(400).json({ error: 'empty_body' });
      }

      const isValid = verifySignature(rawBody, signature, sharedSecret);
      if (!isValid) {
        return res.status(401).json({ error: 'invalid_signature' });
      }

      let event;
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch (err) {
        return res.status(400).json({ error: 'invalid_json' });
      }

      const outcome = await webhookService.handleInventoryEvent(event);
      res.status(outcome.httpStatus).json(outcome.body);
    }
  );

  return router;
}

module.exports = { buildWebhookRouter };
