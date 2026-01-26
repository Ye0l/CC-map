import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);

console.log('Dropping table...');
db.exec('DROP TABLE IF EXISTS daily_job_recommendations');

console.log('Recreating table...');
db.exec(`
    CREATE TABLE daily_job_recommendations (
        date TEXT,
        job_name TEXT,
        comment TEXT NOT NULL,
        PRIMARY KEY (date, job_name)
    )
`);

console.log('Table recreated successfully.');

const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_job_recommendations'").get();
console.log('New Schema:', schema.sql);
