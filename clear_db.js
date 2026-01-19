import db from './db.js';

try {
  db.exec('DELETE FROM horoscopes');
  console.log('Cleared horoscopes table.');
} catch (e) {
  console.error('Error clearing table:', e);
}
