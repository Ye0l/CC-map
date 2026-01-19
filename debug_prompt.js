import { getHoroscopePrompt } from './horoscopePrompt.js';

function getTodayDateString() {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

const date = getTodayDateString();
console.log('--- Debugging Prompt ---');
const prompt = getHoroscopePrompt(date);
console.log('Type of prompt:', typeof prompt);
console.log('Length of prompt:', prompt.length);
if (typeof prompt === 'string') {
  console.log('First 100 chars:', prompt.substring(0, 100));
} else {
  console.log('Value:', prompt);
}
console.log('--- End of Debug ---');
