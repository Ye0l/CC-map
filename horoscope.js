import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import { getHoroscopePrompt, getAllJobsRecommendationPrompt } from './horoscopePrompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 설정 파일에서 API 키 로드
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const genAI = new GoogleGenerativeAI(config.geminiApiKey);

// 별자리 영문명 -> 한글명 매핑
export const zodiacSigns = {
  'Aries': '양자리',
  'Taurus': '황소자리',
  'Gemini': '쌍둥이자리',
  'Cancer': '게자리',
  'Leo': '사자자리',
  'Virgo': '처녀자리',
  'Libra': '천칭자리',
  'Scorpio': '전갈자리',
  'Sagittarius': '궁수자리',
  'Capricorn': '염소자리',
  'Aquarius': '물병자리',
  'Pisces': '물고기자리'
};

const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

/**
 * 오늘 날짜 문자열 반환 (YYYY-MM-DD, 한국 시간 기준)
 */
function getTodayDateString() {
  const now = new Date();
  // UTC+9 적용
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

/**
 * 특정 별자리의 오늘 운세 조회
 */
export async function getDailyHoroscope(signKo) {
  const date = getTodayDateString();

  // 한글 별자리 이름을 영문 키로 변환 (역매핑)
  const signEn = Object.keys(zodiacSigns).find(key => zodiacSigns[key] === signKo);
  if (!signEn) {
    throw new Error('Invalid zodiac sign');
  }

  // 1. DB에서 조회
  const row = db.prepare('SELECT content FROM horoscopes WHERE date = ? AND sign = ?').get(date, signEn);

  if (row) {
    return row.content;
  }

  // 2. DB에 없으면 전체 요청 및 저장 (Cache Miss)
  await fetchAndSaveDailyHoroscopes(date);

  // 3. 재조회
  const newRow = db.prepare('SELECT content FROM horoscopes WHERE date = ? AND sign = ?').get(date, signEn);
  return newRow ? newRow.content : "운세를 불러오는 데 실패했습니다.";
}

/**
 * API 호출하여 모든 별자리 운세 저장
 */
async function fetchAndSaveDailyHoroscopes(date) {
  console.log(`Fetching horoscopes for ${date}...`);

  try {
    // 0. DB에서 직업 시드 가져오기 및 셔플 (랜덤 중복 방지)
    const jobs = db.prepare('SELECT name FROM job_seeds').all().map(r => r.name);
    if (jobs.length === 0) {
      throw new Error('No job seeds found in database.');
    }

    // 날짜 기반 시드 생성 (단순 해시)
    let seed = 0;
    for (let i = 0; i < date.length; i++) {
      seed = (seed * 31 + date.charCodeAt(i)) | 0;
    }

    // Fisher-Yates Shuffle with Seed
    const shuffledJobs = [...jobs];
    for (let i = shuffledJobs.length - 1; i > 0; i--) {
      const x = Math.sin(seed++) * 10000;
      const rand = x - Math.floor(x);
      const j = Math.floor(rand * (i + 1));
      [shuffledJobs[i], shuffledJobs[j]] = [shuffledJobs[j], shuffledJobs[i]];
    }

    // 별자리에 직업 할당 (직업 수가 별자리 수보다 적으면 반복 사용)
    const signKeys = Object.keys(zodiacSigns);
    const jobAssignments = {};

    signKeys.forEach((signKey, index) => {
      const signName = zodiacSigns[signKey]; // 한글명 (ex: 양자리)
      const job = shuffledJobs[index % shuffledJobs.length];
      jobAssignments[signKey] = job; // 영문 키 -> 직업
    });

    const prompt = getHoroscopePrompt(date, jobAssignments);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // JSON 파싱 (마크다운 코드 블록 제거 처리)
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const horoscopes = JSON.parse(jsonStr);

    // 트랜잭션으로 일괄 저장
    const insert = db.prepare('INSERT OR REPLACE INTO horoscopes (date, sign, content) VALUES (@date, @sign, @content)');
    const insertMany = db.transaction((data) => {
      for (const [sign, content] of Object.entries(data)) {
        insert.run({ date, sign, content });
      }
    });

    insertMany(horoscopes);
    console.log(`Saved horoscopes for ${date}.`);

  } catch (error) {
    console.error('Error fetching horoscopes:', error);
    throw error;
  }
}

/**
 * 오늘의 추천 직업 및 멘트 조회 (일괄 생성 및 랜덤 반환)
 */
export async function getDailyJobRecommendation() {
  const date = getTodayDateString();

  // 1. 오늘 날짜의 데이터가 있는지 확인 (아무거나 하나만 조회해도 됨)
  const count = db.prepare('SELECT COUNT(*) as count FROM daily_job_recommendations WHERE date = ?').get(date).count;

  // 2. 데이터가 있으면 랜덤으로 하나 뽑아서 반환
  if (count > 0) {
    const row = db.prepare('SELECT job_name, comment FROM daily_job_recommendations WHERE date = ? ORDER BY RANDOM() LIMIT 1').get(date);
    return row;
  }

  // 3. 데이터가 없으면 일괄 생성 (Batch Generation)
  console.log(`Generating daily job recommendations for ${date}...`);

  // 모든 직업 목록 가져오기
  const jobs = db.prepare('SELECT name FROM job_seeds').all().map(r => r.name);
  if (jobs.length === 0) {
    throw new Error('No jobs found in database');
  }

  // 전체 직업 스킬 데이터 준비
  let allSkillData = '';
  try {
    const skillsPath = path.join(__dirname, 'ff14_pvp_skills.json');
    if (fs.existsSync(skillsPath)) {
      const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

      allSkillData = jobs.map(job => {
        const jobSkills = skills[job];
        if (!jobSkills) return '';

        const skillTexts = jobSkills.map(s => {
          let effect = s.effect.replace(/\n/g, ' ');
          effect = effect.replace(/위력: \d+~?\d*/g, '');
          effect = effect.replace(/회복력: \d+~?\d*/g, '');
          effect = effect.replace(/지속 회복력: \d+/g, '');
          effect = effect.replace(/지속 피해 위력: \d+/g, '');
          effect = effect.replace(/※.*?입니다\./g, '');
          effect = effect.replace(/※.*?변화합니다\./g, '');
          effect = effect.replace(/※ 이 기술은 단축바에 등록할 수 없습니다\./g, '');
          effect = effect.replace(/\s+/g, ' ').trim();
          return `**${s.name}**: ${effect}`;
        }).join(' | ');

        return `### ${job}\n${skillTexts}`;
      }).join('\n\n');
    }
  } catch (e) {
    console.error("Error reading skills for recommendation:", e);
  }

  const prompt = getAllJobsRecommendationPrompt(date, allSkillData);

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // JSON 파싱
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const recommendations = JSON.parse(jsonStr);

    // 트랜잭션으로 일괄 저장
    const insert = db.prepare('INSERT INTO daily_job_recommendations (date, job_name, comment) VALUES (@date, @job_name, @comment)');
    const insertMany = db.transaction((data) => {
      for (const [jobName, comment] of Object.entries(data)) {
        insert.run({ date, job_name: jobName, comment });
      }
    });

    insertMany(recommendations);

    // 저장 후 하나 랜덤 반환
    const row = db.prepare('SELECT job_name, comment FROM daily_job_recommendations WHERE date = ? ORDER BY RANDOM() LIMIT 1').get(date);
    return row || { job_name: jobs[0], comment: "추천 생성 완료! 다시 시도헤주세요." };

  } catch (error) {
    console.error('Error generating job recommendation:', error);
    // AI 실패 시 기본 멘트 반환
    const randomJob = jobs[Math.floor(Math.random() * jobs.length)];
    return { job_name: randomJob, comment: `오늘의 추천 직업은 **[${randomJob}]** 입니다! (AI 생성 실패)` };
  }
}
