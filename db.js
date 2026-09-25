import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { authConfig } from './config/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'presenca.sqlite');

let dbInstance = null;
let SQL = null;

/**
 * Salva o banco em arquivo SQLite
 */
export function saveDb() {
  if (!dbInstance) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Erro ao salvar banco de dados em disco:', err);
  }
}

/**
 * Inicializa a conexão com o SQLite usando sql.js e cria tabelas
 */
export async function initDb(customFilePath = null) {
  if (dbInstance) {
    return dbInstance;
  }

  SQL = await initSqlJs();

  const targetFile = customFilePath || DB_FILE;
  const targetDir = path.dirname(targetFile);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (fs.existsSync(targetFile)) {
    const fileBuffer = fs.readFileSync(targetFile);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Ativar verificação de chaves estrangeiras
  dbInstance.run('PRAGMA foreign_keys = ON;');

  // Criação das tabelas
  createSchema();

  // Criar primeiro administrador caso não exista
  await seedFirstAdmin();

  // Salvar estado inicial
  saveDb();

  return dbInstance;
}

/**
 * Criação das tabelas do sistema
 */
function createSchema() {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      age INTEGER NOT NULL CHECK (age >= 1 AND age <= 129),
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      duration INTEGER NOT NULL CHECK (duration > 0),
      description TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
      notes TEXT,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (student_id, course_id, date)
    );

    CREATE TABLE IF NOT EXISTS attendance_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendance_id INTEGER,
      action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
      user_id INTEGER,
      user_name TEXT,
      student_id INTEGER,
      student_name TEXT,
      course_id INTEGER,
      course_title TEXT,
      date TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
}

/**
 * Garante a existência do primeiro administrador
 */
async function seedFirstAdmin() {
  const existingAdmin = get('SELECT id, username FROM users WHERE role = ? LIMIT 1', ['admin']);
  if (!existingAdmin) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(authConfig.firstAdmin.password, salt);

    run(
      `INSERT INTO users (username, name, password_hash, role, is_active)
       VALUES (?, ?, ?, 'admin', 1)`,
      [authConfig.firstAdmin.username, authConfig.firstAdmin.name, hash]
    );

    console.log('----------------------------------------------------');
    console.log('✅ Usuário Administrador Inicial Criado com Sucesso:');
    console.log(`   Usuário: ${authConfig.firstAdmin.username}`);
    console.log(`   Senha:   ${authConfig.firstAdmin.password}`);
    console.log('----------------------------------------------------');
  }
}

/**
 * Retorna uma única linha como objeto
 */
export function get(sql, params = []) {
  if (!dbInstance) throw new Error('Banco de dados não inicializado. Chame initDb() primeiro.');
  const stmt = dbInstance.prepare(sql);
  try {
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    if (stmt.step()) {
      return stmt.getAsObject();
    }
    return null;
  } finally {
    stmt.free();
  }
}

/**
 * Retorna todas as linhas como array de objetos
 */
export function all(sql, params = []) {
  if (!dbInstance) throw new Error('Banco de dados não inicializado. Chame initDb() primeiro.');
  const stmt = dbInstance.prepare(sql);
  const results = [];
  try {
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    return results;
  } finally {
    stmt.free();
  }
}

/**
 * Executa uma query de alteração (INSERT, UPDATE, DELETE) e salva
 */
export function run(sql, params = []) {
  if (!dbInstance) throw new Error('Banco de dados não inicializado. Chame initDb() primeiro.');
  dbInstance.run(sql, params);
  
  const lastIdRes = dbInstance.exec('SELECT last_insert_rowid() AS id');
  const lastInsertRowid =
    lastIdRes.length > 0 && lastIdRes[0].values && lastIdRes[0].values[0]
      ? lastIdRes[0].values[0][0]
      : 0;

  const changes = dbInstance.getRowsModified();
  saveDb();

  return { lastInsertRowid, changes };
}

/**
 * Executa SQL direto
 */
export function exec(sql) {
  if (!dbInstance) throw new Error('Banco de dados não inicializado. Chame initDb() primeiro.');
  const res = dbInstance.exec(sql);
  saveDb();
  return res;
}

/**
 * Reseta o banco em memória (útil para testes)
 */
export function resetTestDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      fs.unlinkSync(DB_FILE);
    } catch {}
  }
}

export default {
  initDb,
  get,
  all,
  run,
  exec,
  saveDb,
  resetTestDb
};
