import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import wav from 'wav'; // [추가] 공식 문서에서 사용하는 라이브러리

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 설정 로드
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const genAI = new GoogleGenerativeAI(config.geminiApiKey);

// 텍스트 생성용 모델 (대본)
const textModel = genAI.getGenerativeModel({ model: config.geminiTextModel || "gemini-3-flash-preview" });

// 오디오 생성용 모델 (음성)
const audioModel = genAI.getGenerativeModel({ model: config.geminiAudioModel || "gemini-2.5-flash-preview-tts" });

/**
 * 팟캐스트 오디오 저장 디렉토리 생성
 */
const audioDir = path.join(__dirname, 'web', 'public', 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

/**
 * 날짜 문자열 반환 (YYYY-MM-DD)
 */
function getDateString(dateObj = new Date()) {
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(dateObj.getTime() + kstOffset);
    return kstDate.toISOString().split('T')[0];
}

/**
 * 1. 데일리 팟캐스트 대본 생성 (Long-form Examples 적용)
 */
/**
 * 1. 데일리 팟캐스트 프롬프트 생성 (외부 호출 가능)
 */
export async function generatePodcastPrompt(date) {
    // 1. Load Skills Data
    let skillsData = {};
    try {
        const skillsPath = path.join(__dirname, 'ff14_pvp_skills.json');
        if (fs.existsSync(skillsPath)) {
            skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
        }
    } catch (e) {
        console.error("Failed to load skills data:", e);
    }

    // 2. Load Maps
    let availableMaps = [];
    try {
        availableMaps = db.prepare('SELECT name FROM maps').all().map(m => m.name);
        if (availableMaps.length === 0) availableMaps = ["Palaistra"];
    } catch (e) {
        availableMaps = ["Palaistra"];
    }

    // 3. Random Selection
    const JOBS = Object.keys(skillsData);
    let randomJobs = [];

    // Select 6 to 10 random jobs
    const numJobs = Math.floor(Math.random() * (10 - 6 + 1)) + 6;
    if (JOBS.length >= numJobs) {
        randomJobs = [...JOBS].sort(() => 0.5 - Math.random()).slice(0, numJobs);
    } else {
        randomJobs = JOBS.sort(() => 0.5 - Math.random()); // Fallback to all if less than requested
    }

    // Select 3 to 5 random maps
    let randomMaps = [];
    const numMaps = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
    const shuffledMaps = [...availableMaps].sort(() => 0.5 - Math.random());
    randomMaps = shuffledMaps.slice(0, Math.min(numMaps, shuffledMaps.length));

    // 4. Format Skills (Clean up potency/numbers)
    const formatSkills = (jobName) => {
        const jobSkills = skillsData[jobName] || [];
        return jobSkills.map(s => {
            let effect = s.effect || "";
            // Remove detailed numbers to focus on vibes
            effect = effect.replace(/위력: \d+~?\d*/g, '');
            effect = effect.replace(/회복력: \d+~?\d*/g, '');
            effect = effect.replace(/지속 피해 위력: \d+/g, '');
            effect = effect.replace(/지속 회복력: \d+/g, '');
            effect = effect.replace(/※.*?입니다\./g, '');
            effect = effect.replace(/발동 조건:.*?$/gm, ''); // Remove conditions often containing numbers
            effect = effect.replace(/\n+/g, ' ').trim();
            return `- **${s.name}**: ${effect}`;
        }).join('\n');
    };

    // Construct Job Info String dynamically
    const featuredJobsText = randomJobs.map((job, index) => {
        return `**Featured Job ${index + 1}: ${job}**\n[Skill Reference - DO NOT mention numbers, just usage/feeling]\n${formatSkills(job)}`;
    }).join('\n\n');

    // Construct Map Info String
    const featuredMapsText = `**Featured Maps**: ${randomMaps.join(', ')}`;

    const VOICE_PROFILES = {
        "Fenrir": {
            role: "The Energetic Shoutcaster",
            scene: "A high-octane e-sports commentary booth. Screens blazing, crowd roaring in the distance. The air is electric.",
            director_notes: `
Style: Explosive, hype-man energy. Like a sports commentator during a goal.
Pacing: Fast, urgent, punchy.
Dynamics: Loud projection. Elongates vowels on excitement (e.g., "Goooaaal!").`
        },
        "Puck": {
            role: "The Mischievous Radio DJ",
            scene: "A messy, colorful studio filled with toys and fan mail. A 'On Air' sign flickers playfully. Sound effects board is ready.",
            director_notes: `
Style: Sassy, playful, teasing. Prone to giggling and using slang.
Pacing: Bouncy and irregular. Stops to laugh at own jokes.
Tone: Bright, sunny, but slightly mocking.`
        },
        "Charon": {
            role: "The Midnight News Anchor",
            scene: "A dimly lit, sleek news desk overlooking a rainy cyberpunk city. Smooth jazz plays faintly in the background.",
            director_notes: `
Style: Deep, smooth, authoritative. The "Late Night FM" voice.
Pacing: Slow, deliberate, with significant pauses for effect.
Tone: Serious, soothing, trustworthy.`
        }
    };

    const prompt = `
    You are the showrunner for "Crystalline Conflict Radio".
    Date: ${date}

    [Today's Broadcast Topics]
    Here is the official game data. Use these EXACT names for skills and maps to ensure authenticity for Korean players.
    
    ${featuredMapsText}

    ${featuredJobsText}

    [Constraint]
    - Do NOT use technical potency numbers (e.g., "8000 potency"). Focus on vibes, playstyle, and lucky feelings.
    - Use the provided Skill Names naturally in sentences.
    - Choose 2-3 topics from the list above naturally. You don't have to use all of them.

    Generate 3 distinct radio scripts (approx. 60 seconds each) based on the following profiles.
    
    ---
    # AUDIO PROFILE 1: Fenrir
    ## "${VOICE_PROFILES.Fenrir.role}"
    
    ## THE SCENE: ${VOICE_PROFILES.Fenrir.scene}
    
    ### DIRECTOR'S NOTES
    ${VOICE_PROFILES.Fenrir.director_notes}
    ---

    ---
    # AUDIO PROFILE 2: Charon
    ## "${VOICE_PROFILES.Charon.role}"
    
    ## THE SCENE: ${VOICE_PROFILES.Charon.scene}
    
    ### DIRECTOR'S NOTES
    ${VOICE_PROFILES.Charon.director_notes}
    ---

    ---
    # AUDIO PROFILE 3: Puck
    ## "${VOICE_PROFILES.Puck.role}"
    
    ## THE SCENE: ${VOICE_PROFILES.Puck.scene}
    
    ### DIRECTOR'S NOTES
    ${VOICE_PROFILES.Puck.director_notes}
    ---

    [Output Format - JSON Only]
    The "script" field MUST start with the full Context (Profile, Scene, Notes) EXACTLY as shown above, followed by the spoken dialogue.
    [
        { 
            "id": 1, 
            "script": "# AUDIO PROFILE 1: Fenrir\\n## \\"The Energetic Shoutcaster\\"\\n\\n## THE SCENE: A high-octane e-sports commentary booth. Screens blazing, crowd roaring in the distance. The air is electric.\\n\\n### DIRECTOR'S NOTES\\n\\nStyle: Explosive, hype-man energy. Like a sports commentator during a goal.\\nPacing: Fast, urgent, punchy.\\nDynamics: Loud projection. Elongates vowels on excitement (e.g., \\"Goooaaal!\\").\\n\\n(BGM이 고조되는 느낌으로 활기차게) 안녕하십니까! 크리스탈라인 라디오, 여러분의 영원한 선봉장 펜리르입니다! (박수) 으하하! 오늘 전장 날씨, 아주 맑음입니다! 다들 칼 갈고 나오셨습니까? (목소리를 낮추며 진지하게) 제가 어제 정말 기가 막힌 판을 하나 겪었거든요. 볼카노 행성 전장이었는데, 우리 팀이 99%까지 밀리고 있었단 말이죠. 다들 '아, 졌다' 하고 포기하려는 찰나였습니다. (갑자기 텐션을 높이며) 그런데! 우리 팀 나이트가! 그 절체절명의 순간에 '감싸기'를 쓰고 크리스탈 안으로 몸을 던지는 겁니다! 와... 진짜 제가 거기서 소름이 쫙 돋아서 바로 '리미트 브레이크' 꽂아넣고 전세를 뒤집었지 뭡니까! (흥분해서) 여러분, 전장은 끝날 때까지 끝난 게 아닙니다. 그 1초, 그 1틱의 차이가 승패를 가른다고요! 오늘 여러분도 그런 기적 같은 역전승의 주인공이 되시길 바랍니다. 포기하지 마세요! 전장으로 출발! 가자!!", 
            "voice": "Fenrir" 
        },
        { 
            "id": 2, 
            "script": "# AUDIO PROFILE 2: Charon\\n## \\"The Midnight News Anchor\\"\\n\\n## THE SCENE: A dimly lit, sleek news desk overlooking a rainy cyberpunk city. Smooth jazz plays faintly in the background.\\n\\n### DIRECTOR'S NOTES\\n\\nStyle: Deep, smooth, authoritative. The \\"Late Night FM\\" voice.\\nPacing: Slow, deliberate, with significant pauses for effect.\\nTone: Serious, soothing, trustworthy.\\n\\n(차분하고 지적인 톤으로) 1월 31일의 심야 브리핑, 카론입니다. (종이 넘기는 소리) 모두 편안한 밤 보내고 계신지요. 오늘은 조금 진지한 이야기를 해볼까 합니다. 최근 랭크 매치 데이터를 보면 '전사'와 '백마도사'의 픽률이 기형적으로 높아졌습니다. 이게 무엇을 의미할까요? (잠시 침묵) 바로 '군중 제어기', 즉 CC기 연계가 승리의 절대적인 열쇠가 되었다는 뜻입니다. 예전처럼 혼자서 무쌍을 찍는 시대는 지났어요. (단호하게) 제가 오늘 관전한 경기에서도, 아무리 딜이 센 사무라이라도 기절 한 번 걸리니까 정화도 못 쓰고 순식간에 녹아버리더군요. 늑대 여러분, 지금 당장 팀원과 합을 맞추세요. '내가 캐리하겠다'는 생각보다는 '내가 팀을 위해 CC기를 넣어주겠다'는 마인드. 그게 바로 크리스탈 등급으로 가는 지름길입니다. 오늘 밤은 동료를 믿어보시길. 이상, 카론이었습니다.", 
            "voice": "Charon" 
        },
        {
            "id": 3,
            "script": "# AUDIO PROFILE 3: Puck\\n## \\"The Mischievous Radio DJ\\"\\n\\n## THE SCENE: A messy, colorful studio filled with toys and fan mail. A 'On Air' sign flickers playfully. Sound effects board is ready.\\n\\n### DIRECTOR'S NOTES\\n\\nStyle: Sassy, playful, teasing. Prone to giggling and using slang.\\nPacing: Bouncy and irregular. Stops to laugh at own jokes.\\nTone: Bright, sunny, but slightly mocking.\\n\\n(키득키득 웃으며) 아~ 마이크 테스트, 마이크 테스트. 안녕? 나야, 퍽(Puck)! (장난스럽게) 야, 너네 솔직히 말해봐. 어제 '방어' 켜놓고 물약 마시는 거 까먹은 적 있지? 그치? (비웃듯이) 에이~ 거짓말 하지 마. 내가 다 봤어! 어제 팔라이스트라 맵에서 구석에 숨어서 엘릭서 마시다가, 적한테 들켜서 허둥지둥 도망가던 닌자! 그래, 너 말이야 너! (깔깔 웃으며) 아 진짜 배꼽 빠지는 줄 알았다니까? 근데 뭐, 사실 나도 가끔 그러긴 해. 급하면 물약 버튼이 아니라 감정표현 버튼 누르고 막 춤추고 그런다? (능청스럽게) 뭐 어때, 게임인데! 실수 좀 하면 어때? 웃으면서 하는 거지! 대신 랭크 매치에서는 그러면 안 된다? 알았지? 형이 지켜본다! 자, 오늘도 즐겜하고! 멘탈 꽉 잡으라고! 안녕!",
            "voice": "Puck"
        }
    ]
    `;

    return prompt;
}

/**
 * 2. 데일리 팟캐스트 대본 생성 실행
 */
async function generateDailyPodcastScripts(date) {
    console.log(`Generating podcast scripts for ${date}...`);

    try {
        const prompt = await generatePodcastPrompt(date);

        const result = await textModel.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (e) {
        console.error("Script generation failed:", e);
        return [{
            id: 1,
            script: "대본 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
            voice: "Charon"
        }];
    }
}

async function generateAudio(script, voiceName, outputFilename) {
    // voiceName이 없거나 이상할 경우를 대비한 안전장치
    const finalVoice = voiceName || "Zephyr";

    console.log(`Generating audio for: ${outputFilename} (Voice: ${finalVoice})`);

    const apiKey = config.geminiApiKey;
    const modelId = config.geminiAudioModel || "gemini-2.5-flash-preview-tts";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}`;

    const body = {
        contents: [{
            parts: [{ text: script }]
        }],
        generationConfig: {
            responseModalities: ["audio"],
            speech_config: {
                voice_config: {
                    prebuilt_voice_config: {
                        // 작가 모델이 골라준 목소리를 그대로 적용
                        voice_name: finalVoice
                    }
                }
            }
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        const responseText = await response.text();
        const chunks = JSON.parse(responseText);
        const audioBuffers = [];

        for (const chunk of chunks) {
            if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
                audioBuffers.push(Buffer.from(chunk.candidates[0].content.parts[0].inlineData.data, 'base64'));
            }
        }

        if (audioBuffers.length === 0) throw new Error("No audio data found.");

        const pcmBuffer = Buffer.concat(audioBuffers);
        const filePath = path.join(audioDir, outputFilename);

        // [핵심 변경] wav 라이브러리를 사용하여 저장 (문서 참조)
        await new Promise((resolve, reject) => {
            const writer = new wav.FileWriter(filePath, {
                channels: 1,             // 문서는 1채널 사용
                sampleRate: 24000,       // 문서는 24kHz 사용
                bitDepth: 16             // 문서는 16비트 사용 (sampleWidth 2 * 8)
            });

            writer.on('finish', () => {
                console.log(`Audio saved to ${filePath} (Voice: ${voiceName})`);
                resolve();
            });
            writer.on('error', reject);

            writer.write(pcmBuffer);
            writer.end();
        });

    } catch (error) {
        throw error;
    }
}

/**
 * 3. 전체 프로세스 통합
 */
/**
 * 3. 전체 프로세스 통합 (Scripts 존재 시 오디오 확인 및 재생성)
 */
export async function fetchAndSaveDailyPodcasts(date) {
    try {
        // 1. DB에서 해당 날짜의 팟캐스트가 있는지 확인
        let podcasts = db.prepare('SELECT * FROM daily_podcasts WHERE date = ?').all(date);

        // 2. 없으면 대본 생성
        if (podcasts.length === 0) {
            const scripts = await generateDailyPodcastScripts(date);
            // DB에 우선 저장 (오디오 경로는 나중에 업데이트하거나 미리 지정)
            const insert = db.prepare(`
                INSERT OR REPLACE INTO daily_podcasts (date, id, script, voice, audio_path)
                VALUES (@date, @id, @script, @voice, @audio_path)
            `);

            const insertMany = db.transaction((items) => {
                for (const item of items) {
                    const fileName = `podcast_${date}_${item.id}.wav`;
                    const relativePath = `/audio/${fileName}`;
                    insert.run({
                        date: date,
                        id: item.id,
                        script: item.script,
                        voice: item.voice,
                        audio_path: relativePath
                    });
                }
            });
            insertMany(scripts);

            // 저장 후 다시 불러오기 (일관성 유지를 위해)
            podcasts = db.prepare('SELECT * FROM daily_podcasts WHERE date = ?').all(date);
            console.log(`Generated and saved ${podcasts.length} new scripts for ${date}.`);
        } else {
            console.log(`Found ${podcasts.length} existing scripts for ${date}. Checking audio files...`);
        }

        // 3. 오디오 파일 확인 및 생성 (없으면 재생성)
        for (const podcast of podcasts) {
            // DB에 저장된 경로는 .mp3일 수도 있고 .wav일 수도 있음 (마이그레이션 이슈)
            // 일단 DB 경로를 우선하되, 확장자 변경이 필요하면 업데이트 로직 필요
            const audioPath = podcast.audio_path.replace('.mp3', '.wav');
            const fileName = path.basename(audioPath);
            const filePath = path.join(audioDir, fileName);

            // 만약 DB가 .mp3로 되어있으면 업데이트
            if (podcast.audio_path.endsWith('.mp3')) {
                db.prepare('UPDATE daily_podcasts SET audio_path = ? WHERE date = ? AND id = ?')
                    .run(audioPath, date, podcast.id);
            }

            // 파일이 없으면 생성
            if (!fs.existsSync(filePath)) {
                console.log(`Audio missing for ID ${podcast.id}, regenerating...`);
                try {
                    await generateAudio(podcast.script, podcast.voice, fileName);
                } catch (e) {
                    console.error(`Failed to generate audio for ${fileName}:`, e.message);
                }
            } else {
                // console.log(`Audio exists for ID ${podcast.id}, skipping.`);
            }
        }

        console.log(`Podcast processing for ${date} completed.`);

    } catch (error) {
        console.error('Error in fetchAndSaveDailyPodcasts:', error);
    }
}

/**
 * 4. 랜덤 팟캐스트 가져오기
 */
export function getRandomPodcast(date) {
    const row = db.prepare('SELECT * FROM daily_podcasts WHERE date = ? ORDER BY RANDOM() LIMIT 1').get(date);
    return row;
}

/**
 * 5. 특정 목소리의 팟캐스트 가져오기
 */
export function getPodcastByVoice(date, voice) {
    const row = db.prepare('SELECT * FROM daily_podcasts WHERE date = ? AND voice = ?').get(date, voice);
    return row;
}

/**
 * PCM 데이터에 WAV 헤더 추가
 * @param {Buffer} pcmData Raw PCM buffer
 * @param {number} sampleRate Sample rate (e.g., 24000)
 * @param {number} channels Number of channels (e.g., 1)
 * @param {number} bitDepth Bit depth (e.g., 16)
 */
function addWavHeader(pcmData, sampleRate, channels, bitDepth) {
    const byteRate = (sampleRate * channels * bitDepth) / 8;
    const blockAlign = (channels * bitDepth) / 8;
    const dataSize = pcmData.length;
    const headerSize = 44;
    const totalSize = headerSize + dataSize; // Total file size - 8

    const header = Buffer.alloc(headerSize);

    // RIFF chunk
    header.write('RIFF', 0);
    header.writeUInt32LE(totalSize - 8, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
}
