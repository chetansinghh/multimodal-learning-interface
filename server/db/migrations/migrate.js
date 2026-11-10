// server/db/migrations/migrate.js
// Safe migration runner with tracking in _schema_migrations
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(customPool = null) {
  const pool = customPool || new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  const results = [];

  try {
    // 1. Ensure migrations metadata table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id SERIAL PRIMARY KEY,
        version TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Discover .sql files in migrations dir
    const files = fs.readdirSync(__dirname)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.split('_')[0];
      const checkRes = await client.query('SELECT version FROM _schema_migrations WHERE version = $1', [version]);

      if (checkRes.rows.length === 0) {
        console.log(`Applying migration: ${file}...`);
        const sqlContent = fs.readFileSync(path.join(__dirname, file), 'utf8');

        await client.query('BEGIN');
        await client.query(sqlContent);
        await client.query('INSERT INTO _schema_migrations (version, name) VALUES ($1, $2)', [version, file]);
        await client.query('COMMIT');

        console.log(`✓ Migration ${file} applied successfully.`);
        results.push({ file, version, status: 'applied' });
      } else {
        results.push({ file, version, status: 'already_applied' });
      }
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    if (!customPool) {
      await pool.end();
    }
  }

  return results;
}

// Allow direct CLI execution: node server/db/migrations/migrate.js
if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  runMigrations()
    .then(r => console.log('All migrations processed:', r))
    .catch(e => { console.error('Migration error:', e); process.exit(1); });
}

