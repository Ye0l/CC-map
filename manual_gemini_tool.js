import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import db from './db.js';
import { getHoroscopePrompt, getAllJobsRecommendationPrompt } from './horoscopePrompt.js';
import { zodiacSigns } from './horoscope.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

function getTodayDateString() {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    return kstDate.toISOString().split('T')[0];
}

async function preparePrompts() {
    const date = getTodayDateString();
    console.log(`\n[1단계] ${date}자 프롬프트 준비 중...`);

    // 1. 직업 데이터 준비 (horoscope.js 로직 재현)
    const jobs = db.prepare('SELECT name FROM job_seeds').all().map(r => r.name);
    if (jobs.length === 0) {
        throw new Error('DB에 직업 데이터가 없습니다. 먼저 데이터 마이그레이션을 확인하세요.');
    }

    let seed = 0;
    for (let i = 0; i < date.length; i++) {
        seed = (seed * 31 + date.charCodeAt(i)) | 0;
    }

    const shuffledJobs = [...jobs];
    for (let i = shuffledJobs.length - 1; i > 0; i--) {
        const x = Math.sin(seed++) * 10000;
        const rand = x - Math.floor(x);
        const j = Math.floor(rand * (i + 1));
        [shuffledJobs[i], shuffledJobs[j]] = [shuffledJobs[j], shuffledJobs[i]];
    }

    const signKeys = Object.keys(zodiacSigns);
    const jobAssignments = {};
    signKeys.forEach((signKey, index) => {
        jobAssignments[signKey] = shuffledJobs[index % shuffledJobs.length];
    });

    // 2. 전체 직업 스킬 데이터 (추천용)
    let allSkillData = '';
    const skillsPath = path.join(__dirname, 'ff14_pvp_skills.json');
    if (fs.existsSync(skillsPath)) {
        const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
        allSkillData = jobs.map(job => {
            const jobSkills = skills[job];
            if (!jobSkills) return '';
            const skillTexts = jobSkills.map(s => {
                let effect = s.effect.replace(/\n/g, ' ');
                effect = effect.replace(/위력: \d+~?\d*/g, '').replace(/회복력: \d+~?\d*/g, '').replace(/지속 회복력: \d+/g, '').replace(/지속 피해 위력: \d+/g, '').replace(/※.*?입니다\./g, '').replace(/※.*?변화합니다\./g, '').replace(/※ 이 기술은 단축바에 등록할 수 없습니다\./g, '').replace(/\s+/g, ' ').trim();
                return `**${s.name}**: ${effect}`;
            }).join(' | ');
            return `### ${job}\n${skillTexts}`;
        }).join('\n\n');
    }

    // 3. 프롬프트 생성 및 저장
    const horoscopePrompt = getHoroscopePrompt(date, jobAssignments);
    const jobsPrompt = getAllJobsRecommendationPrompt(date, allSkillData);

    fs.writeFileSync('manual_prompt_horoscope.txt', horoscopePrompt);
    fs.writeFileSync('manual_prompt_jobs.txt', jobsPrompt);

    console.log(`\n프롬프트 파일이 생성되었습니다:`);
    console.log(`- manual_prompt_horoscope.txt`);
    console.log(`- manual_prompt_jobs.txt`);
    console.log(`\n위 파일의 내용을 제미나이에 붙여넣고 결과를 받아오세요.`);
}

async function saveResults() {
    const date = getTodayDateString();
    console.log(`\n[2단계] 결과 데이터 DB 저장 중...`);

    try {
        // 1. 운세 데이터 저장
        if (fs.existsSync('manual_response_horoscope.json')) {
            const data = JSON.parse(fs.readFileSync('manual_response_horoscope.json', 'utf8'));
            const insert = db.prepare('INSERT OR REPLACE INTO horoscopes (date, sign, content) VALUES (@date, @sign, @content)');
            const insertMany = db.transaction((horos) => {
                for (const [sign, content] of Object.entries(horos)) {
                    insert.run({ date, sign, content });
                }
            });
            insertMany(data);
            console.log(`- ${Object.keys(data).length}개의 별자리 운세 저장 완료.`);
        } else {
            console.log(`- manual_response_horoscope.json 파일이 없어 운세 저장을 건너뜁니다.`);
        }

        // 2. 직업 추천 데이터 저장
        if (fs.existsSync('manual_response_jobs.json')) {
            const data = JSON.parse(fs.readFileSync('manual_response_jobs.json', 'utf8'));
            const insert = db.prepare('INSERT OR IGNORE INTO daily_job_recommendations (date, job_name, comment) VALUES (@date, @job_name, @comment)');
            const insertMany = db.transaction((recoms) => {
                for (const [jobName, comment] of Object.entries(recoms)) {
                    insert.run({ date, job_name: jobName, comment });
                }
            });
            insertMany(data);
            console.log(`- ${Object.keys(data).length}개의 직업 추천 저장 완료.`);
        } else {
            console.log(`- manual_response_jobs.json 파일이 없어 직업 추천 저장을 건너뜁니다.`);
        }

        console.log(`\n모든 작업이 완료되었습니다!`);
    } catch (error) {
        console.error(`\n저장 중 오류 발생:`, error.message);
    }
}

async function main() {
    await preparePrompts();

    console.log(`\n---------------------------------------------------------`);
    console.log(`1. 제미나이의 JSON 응답을 아래 파일명으로 저장해 주세요:`);
    console.log(`   - manual_response_horoscope.json`);
    console.log(`   - manual_response_jobs.json`);
    console.log(`2. 파일 저장을 완료했다면 아래 'ENTER'를 눌러주세요.`);
    console.log(`---------------------------------------------------------`);

    await question('\n[계속하려면 ENTER를 누르세요]');

    await saveResults();
    rl.close();
}

main().catch(console.error);
