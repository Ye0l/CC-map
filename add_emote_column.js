import db from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mapListPath = path.join(__dirname, 'map_list.json');
const mapList = JSON.parse(fs.readFileSync(mapListPath, 'utf8'));

console.log('Starting migration: Add emote column to maps table...');

try {
  // 1. Add emote column if it doesn't exist
  try {
    db.prepare('ALTER TABLE maps ADD COLUMN emote TEXT').run();
    console.log('Added emote column.');
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('Emote column already exists.');
    } else {
      throw error;
    }
  }

  // 2. Update emote for each map
  const updateStmt = db.prepare('UPDATE maps SET emote = ? WHERE name = ?');

  // Using transaction for safety and speed
  const updateUser = db.transaction((maps) => {
    for (const map of maps) {
      const result = updateStmt.run(map.emote, map.name);
      console.log(`Updated ${map.name}: result changes ${result.changes}`);
    }
  });

  updateUser(mapList);
  console.log('Migration completed successfully.');

} catch (error) {
  console.error('Migration failed:', error);
}
