
import db from './db.js';
import { fetchAndSaveDailyPodcasts } from './podcast.js';

async function regenerateTodayPodcast() {
    const kstOffset = 9 * 60 * 60 * 1000;
    const today = new Date(new Date().getTime() + kstOffset).toISOString().split('T')[0];

    console.log(`[Regenerate] Starting manual podcast regeneration for today: ${today}`);

    try {
        // 1. Delete existing data for today
        const deleteResult = db.prepare('DELETE FROM daily_podcasts WHERE date = ?').run(today);
        console.log(`[Regenerate] Deleted ${deleteResult.changes} existing podcast entries for ${today}.`);

        // 2. Regenerate (Create Script + Audio)
        console.log(`[Regenerate] Generating new scripts and audio...`);
        await fetchAndSaveDailyPodcasts(today);

        console.log(`[Regenerate] ✅ Successfully regenerated daily podcast for ${today}.`);

    } catch (error) {
        console.error(`[Regenerate] ❌ Error occurred:`, error);
    }
}

regenerateTodayPodcast();
