import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: 팁 목록 조회
app.get('/api/tips', (req, res) => {
  try {
    const tips = db.prepare('SELECT * FROM tips ORDER BY id DESC').all();
    res.json(tips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 팁 추가
app.post('/api/tips', (req, res) => {
  const { category, keyword, content } = req.body;
  try {
    const stmt = db.prepare('INSERT INTO tips (category, keyword, content) VALUES (?, ?, ?)');
    const result = stmt.run(category, keyword, content);
    res.json({ id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 팁 삭제
app.delete('/api/tips/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM tips WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 맵 목록 조회
app.get('/api/maps', (req, res) => {
  try {
    const maps = db.prepare('SELECT * FROM maps ORDER BY rotation_order ASC').all();
    res.json(maps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 맵 추가/수정 (간단히 구현)
app.post('/api/maps', (req, res) => {
  const { name, emote, rotation_order } = req.body;
  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO maps (name, emote, rotation_order) VALUES (?, ?, ?)');
    stmt.run(name, emote, rotation_order);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 전적 조회
app.get('/api/duel_stats', (req, res) => {
  try {
    const stats = db.prepare('SELECT * FROM duel_stats ORDER BY wins DESC LIMIT 100').all();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 서버 실행 함수 (index.js에서 호출)
export function startWebServer() {
  app.listen(PORT, () => {
    console.log(`WebUI Server is running on http://localhost:${PORT}`);
  });
}
