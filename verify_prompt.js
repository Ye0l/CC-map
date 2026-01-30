import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePodcastPrompt } from './podcast.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function savePrompt() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Generating prompt for date: ${today}`);

    try {
        const prompt = await generatePodcastPrompt(today);
        const outputPath = path.join(__dirname, 'completed_podcast_prompt.txt');

        fs.writeFileSync(outputPath, prompt, 'utf8');
        console.log(`✅ Success! Prompt saved to: ${outputPath}`);
    } catch (error) {
        console.error("❌ Error generating prompt:", error);
    }
}

savePrompt();
