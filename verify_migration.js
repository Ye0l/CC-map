import db from './db.js';
import { maps, getCurrentRotation, getNextMapSchedules } from './mapRotation.js';

console.log('--- Verification Start ---');

// 1. Check DB data
const count = db.prepare('SELECT COUNT(*) AS count FROM maps').get().count;
console.log(`Total maps in DB: ${count}`);

// 2. Check loaded maps in mapRotation.js
console.log(`Loaded maps in mapRotation.js: ${maps.length}`);
console.log('Maps:', maps);

if (maps.length === 0) {
  console.error('ERROR: No maps loaded!');
  process.exit(1);
}

// 3. functional check
try {
  const rotation = getCurrentRotation();
  console.log('Current Rotation:', rotation);

  const schedules = getNextMapSchedules(maps[0], 2);
  console.log(`Schedules for ${maps[0]}:`, schedules);

  console.log('--- Verification Success ---');
} catch (error) {
  console.error('ERROR during functional check:', error);
  process.exit(1);
}
