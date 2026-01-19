import { getHoroscopePrompt } from './horoscopePrompt.js';

function getTodayDateString() {
  const now = new Date();
  // UTC+9 적용
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

const date = getTodayDateString();
console.log('--- Generating Prompt for', date, '---');
console.log(getHoroscopePrompt(date));
console.log('--- End of Prompt ---');
