import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-demo';

// Initialize SQLite database
// Use a persistent path if in production, otherwise local file
const dbPath = process.env.NODE_ENV === 'production' ? '/data/database.sqlite' : 'database.sqlite';
const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  );
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    text TEXT,
    completed BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT 0
  );
`);

// Insert demo user if not exists
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)');
insertUser.run('demo', 'demo');

app.use(cors());
app.use(express.json());

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// API Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password) as any;

  if (user) {
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.get('/api/todos', authenticateToken, (req: any, res) => {
  const todos = db.prepare('SELECT * FROM todos WHERE user_id = ? AND deleted = 0 ORDER BY created_at DESC').all(req.user.id);
  res.json(todos.map((t: any) => ({ ...t, completed: Boolean(t.completed) })));
});

app.post('/api/todos', authenticateToken, (req: any, res) => {
  const { id, text, completed } = req.body;
  const stmt = db.prepare('INSERT INTO todos (id, user_id, text, completed) VALUES (?, ?, ?, ?)');
  stmt.run(id, req.user.id, text, completed ? 1 : 0);
  res.json({ success: true });
});

app.put('/api/todos/:id', authenticateToken, (req: any, res) => {
  const { text, completed } = req.body;
  const stmt = db.prepare('UPDATE todos SET text = ?, completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
  stmt.run(text, completed ? 1 : 0, req.params.id, req.user.id);
  res.json({ success: true });
});

app.delete('/api/todos/:id', authenticateToken, (req: any, res) => {
  const stmt = db.prepare('UPDATE todos SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
  stmt.run(req.params.id, req.user.id);
  res.json({ success: true });
});

// Sync endpoint for offline operations
app.post('/api/sync', authenticateToken, (req: any, res) => {
  const { operations } = req.body;
  
  const createStmt = db.prepare('INSERT OR REPLACE INTO todos (id, user_id, text, completed) VALUES (?, ?, ?, ?)');
  const updateStmt = db.prepare('UPDATE todos SET text = ?, completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
  const deleteStmt = db.prepare('UPDATE todos SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');

  const transaction = db.transaction((ops: any[]) => {
    for (const op of ops) {
      if (op.type === 'CREATE') {
        createStmt.run(op.payload.id, req.user.id, op.payload.text, op.payload.completed ? 1 : 0);
      } else if (op.type === 'UPDATE') {
        updateStmt.run(op.payload.text, op.payload.completed ? 1 : 0, op.payload.id, req.user.id);
      } else if (op.type === 'DELETE') {
        deleteStmt.run(op.payload.id, req.user.id);
      }
    }
  });

  try {
    transaction(operations);
    res.json({ success: true });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: { server: httpServer }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
