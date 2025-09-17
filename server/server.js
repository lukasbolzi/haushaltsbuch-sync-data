import 'dotenv/config';  // auto-loads .env into process.env
import express from 'express';
import bodyParser from 'body-parser';
import { JSONFilePreset } from 'lowdb/node';

const app = express();
app.use(bodyParser.json({ limit: '5mb' }));

// --- Config --- //
const API_KEY = process.env.API_KEY;

// --- API key middleware --- //
function apiKeyMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const [scheme, key] = authHeader.split(' ');
  if (scheme !== 'Bearer' || key !== API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}

// Apply API key middleware to all routes
app.use(apiKeyMiddleware);

// --- DB adapters --- //
const dbStatements = await JSONFilePreset('./db/statements.json', {
  statements: [],
  standingorders: [],
  standingorders_statements: []
});

const dbCategories = await JSONFilePreset('./db/categories.json', {
  categories: []
});

// --- Helper: get db + collection by name --- //
function getCollection(dbName, collection) {
  console.log("get " + collection)
  if (dbName === 'statements') {
    return dbStatements.data[collection];
  } else if (dbName === 'categories') {
    return dbCategories.data[collection];
  }
  return null;
}

// --- Routes --- //

// List all records' metadata
app.get('/:db/:collection/meta', (req, res) => {
  const { db, collection } = req.params;
  const col = getCollection(db, collection);
  if (!col) return res.status(404).json({ error: 'Invalid db or collection' });

  const metas = col.map(r => ({
    id: r.id,
    lastModified: r.lastModified,
    version: r.version
  }));
  res.json(metas);
});

// GET all records in a collection
app.get('/:db/:collection', (req, res) => {
  const { db, collection } = req.params;
  const col = getCollection(db, collection);

  if (!col) return res.status(404).json({ error: 'Invalid db or collection' });

  res.json(col);
});

// Get one record (full encrypted blob)
app.get('/:db/:collection/:id', (req, res) => {
  const { db, collection, id } = req.params;
  const col = getCollection(db, collection);
  if (!col) return res.status(404).json({ error: 'Invalid db or collection' });

  const record = col.find(r => r.id === id);
  if (!record) return res.status(404).json({ error: 'Not found' });

  res.json(record);
});

// Upsert a record
app.post('/:db/:collection', async (req, res) => {
  const { db, collection } = req.params;
  console.log("post " + collection)
  const col = getCollection(db, collection);
  if (!col) return res.status(404).json({ error: 'Invalid db or collection' });

  const records = Array.isArray(req.body) ? req.body : [req.body];

  for (const rec of records) {
    if (!rec.id || !rec.encryptedData) {
      return res.status(400).json({ error: 'Missing id or encryptedData' });
    }

    const idx = col.findIndex(r => r.id === rec.id);
    if (idx >= 0) {
      col[idx] = rec; // update
    } else {
      col.push(rec); // insert
    }
  }

  if (db === 'statements') {
    await dbStatements.write();
  } else if (db === 'categories') {
    await dbCategories.write();
  }

  res.json({ ok: true, count: records.length });
});

// Delete a record
app.delete('/:db/:collection/:id', async (req, res) => {
  const { db, collection, id } = req.params;
  const col = getCollection(db, collection);
  if (!col) return res.status(404).json({ error: 'Invalid db or collection' });

  const idx = col.findIndex(r => r.id === id);
  if (idx >= 0) {
    col.splice(idx, 1);
    if (db === 'statements') {
      await dbStatements.write();
    } else if (db === 'categories') {
      await dbCategories.write();
    }
  }

  res.json({ ok: true });
});

// --- Start server --- //
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Sync server listening on port ${PORT}`);
});
