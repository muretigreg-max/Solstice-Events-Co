'use strict';

const path = require('path');
const { buildApp } = require('./app');

const PORT = process.env.PORT || 4001;
const STORE_PATH = path.join(__dirname, '..', 'inventory.json');

const { app } = buildApp({ storePath: STORE_PATH });

app.listen(PORT, () => {
  console.log(`Inventory webhook receiver listening on http://localhost:${PORT}/webhooks/inventory`);
  console.log(`Snapshot: http://localhost:${PORT}/inventory`);
});
