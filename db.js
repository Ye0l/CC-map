import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB 파일 위치 설정 (현재 디렉토리)
const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath, { verbose: console.log });

// 테이블 생성
const initDb = () => {
  // 맵 테이블
  db.exec(`
        CREATE TABLE IF NOT EXISTS maps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            emote TEXT,
            rotation_order INTEGER UNIQUE
        )
    `);

  // 오늘의 운세 테이블
  db.exec(`
        CREATE TABLE IF NOT EXISTS horoscopes (
            date TEXT NOT NULL,
            sign TEXT NOT NULL,
            content TEXT NOT NULL,
            PRIMARY KEY (date, sign)
        )
    `);

  // 직업 시드 테이블
  db.exec(`
        CREATE TABLE IF NOT EXISTS job_seeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    `);

  // 데이터 마이그레이션 (map_list.json -> DB)
  const count = db.prepare('SELECT COUNT(*) AS count FROM maps').get().count;
  if (count === 0) {
    console.log('Migrating data from map_list.json...');
    const mapListPath = path.join(__dirname, 'map_list.json');
    if (fs.existsSync(mapListPath)) {
      const maps = JSON.parse(fs.readFileSync(mapListPath, 'utf8'));

      const insert = db.prepare('INSERT INTO maps (name, emote, rotation_order) VALUES (@name, @emote, @order)');
      const insertMany = db.transaction((maps) => {
        for (let i = 0; i < maps.length; i++) {
          insert.run({ name: maps[i].name, emote: maps[i].emote, order: i });
        }
      });

      insertMany(maps);
      console.log(`Migrated ${maps.length} maps.`);
    } else {
      console.warn('map_list.json not found. Database is empty.');
    }
  }

  // 데이터 마이그레이션 (ff14_pvp_skills.json -> job_seeds)
  const jobCount = db.prepare('SELECT COUNT(*) AS count FROM job_seeds').get().count;
  if (jobCount === 0) {
    console.log('Migrating data from ff14_pvp_skills.json...');
    const skillPath = path.join(__dirname, 'ff14_pvp_skills.json');
    if (fs.existsSync(skillPath)) {
      const skills = JSON.parse(fs.readFileSync(skillPath, 'utf8'));
      const jobs = Object.keys(skills); // 직업 이름만 추출

      const insert = db.prepare('INSERT OR IGNORE INTO job_seeds (name) VALUES (?)');
      const insertMany = db.transaction((jobList) => {
        for (const job of jobList) {
          insert.run(job);
        }
      });

      insertMany(jobs);
      console.log(`Migrated ${jobs.length} jobs into job_seeds.`);
    } else {
      console.warn('ff14_pvp_skills.json not found. Job seeds skipped.');
    }
  }
};

initDb();

export default db;
