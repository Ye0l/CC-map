import { getDailyHoroscope } from './horoscope.js';

console.log('--- Horoscope Feature Verification ---');

async function testHoroscope() {
  try {
    console.log('Fetching horoscope for Aries (양자리)...');
    const content = await getDailyHoroscope('양자리');
    console.log('Result:', content);
    console.log('--- Verification Success ---');
  } catch (error) {
    console.error('--- Verification Failed ---');
    console.error(error.message);
    if (error.message.includes('API key')) {
      console.log('Check your config.json for Gemini API Key.');
    }
  }
}

testHoroscope();
