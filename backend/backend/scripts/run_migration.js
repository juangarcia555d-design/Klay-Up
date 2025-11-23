import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function run() {
  const sqlPath = path.resolve(process.cwd(), 'migrations', 'create_music_table.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('No se encontró el archivo de migración:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION || process.env.PGHOST ?
    undefined : undefined;

  const clientConfig = {};
  // Prefer DATABASE_URL
  if (process.env.DATABASE_URL) clientConfig.connectionString = process.env.DATABASE_URL;
  else if (process.env.PGHOST) {
    clientConfig.host = process.env.PGHOST;
    clientConfig.port = process.env.PGPORT || 5432;
    clientConfig.user = process.env.PGUSER;
    clientConfig.password = process.env.PGPASSWORD;
    clientConfig.database = process.env.PGDATABASE;
  } else {
    console.error('No se encontró DATABASE_URL ni variables PG*. Define DATABASE_URL en backend/.env o exporta PGHOST/PGUSER/PGPASSWORD/PGDATABASE.');
    process.exit(1);
  }

  const client = new Client(clientConfig);
  try {
    await client.connect();
    console.log('Conectado a la BD. Ejecutando migración...');
    await client.query(sql);
    console.log('Migración ejecutada correctamente.');
  } catch (e) {
    console.error('Error ejecutando migración:', e.message || e);
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}

run();
