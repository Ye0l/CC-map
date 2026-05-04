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

  // 일일 직업 추천 테이블
  db.exec(`
        CREATE TABLE IF NOT EXISTS daily_job_recommendations (
            date TEXT,
            job_name TEXT,
            comment TEXT NOT NULL,
            PRIMARY KEY (date, job_name)
        )
    `);

  // 결투 전적 테이블
  db.exec(`
        CREATE TABLE IF NOT EXISTS duel_stats (
            user_id TEXT PRIMARY KEY,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0
        )
    `);

  // 팁 데이터 테이블
  db.exec(`
        CREATE TABLE IF NOT EXISTS tips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            keyword TEXT NOT NULL,
            content TEXT NOT NULL
        )
    `);

  // 일일 팟캐스트 테이블
  db.exec(`
        CREATE TABLE IF NOT EXISTS daily_podcasts (
            date TEXT NOT NULL,
            id INTEGER NOT NULL,
            script TEXT NOT NULL,
            voice TEXT NOT NULL,
            audio_path TEXT,
            PRIMARY KEY (date, id)
        )
    `);

  // 데이터 동기화 (map_list.json -> DB)
  const mapListPath = path.join(__dirname, 'map_list.json');
  if (fs.existsSync(mapListPath)) {
    const maps = JSON.parse(fs.readFileSync(mapListPath, 'utf8'));
    const upsert = db.prepare(`
      INSERT INTO maps (name, emote, rotation_order)
      VALUES (@name, @emote, @order)
      ON CONFLICT(rotation_order) DO UPDATE SET
        name = excluded.name,
        emote = excluded.emote
    `);
    const deleteRemovedMaps = db.prepare(`
      DELETE FROM maps
      WHERE rotation_order >= ?
         OR name NOT IN (${maps.map(() => '?').join(', ')})
    `);
    const syncMaps = db.transaction((maps) => {
      deleteRemovedMaps.run(maps.length, ...maps.map(map => map.name));
      for (let i = 0; i < maps.length; i++) {
        upsert.run({ name: maps[i].name, emote: maps[i].emote, order: i });
      }
    });

    syncMaps(maps);
    console.log(`Synced ${maps.length} maps.`);
  } else {
    console.warn('map_list.json not found. Map data sync skipped.');
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
