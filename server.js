import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initDb, all, get } from './db.js';
import { authenticateToken } from './middleware/auth.js';

import authRouter from './routes/auth.js';
import studentsRouter from './routes/students.js';
import coursesRouter from './routes/courses.js';
import attendanceRouter from './routes/attendance.js';
import historyRouter from './routes/history.js';
import reportsRouter from './routes/reports.js';
import usersRouter from './routes/users.js';
import auditRouter from './routes/audit.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de parsing e cookies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Garantir que o banco de dados esteja carregado antes de qualquer rota
let dbReady = false;
const dbInitPromise = initDb()
  .then(() => {
    dbReady = true;
  })
  .catch(err => {
    console.error('Falha crítica ao inicializar banco de dados SQLite:', err);
  });

app.use(async (req, res, next) => {
  if (!dbReady) {
    await dbInitPromise;
  }
  next();
});

// Arquivos estáticos do frontend puro
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Endpoint do Dashboard
app.get('/api/dashboard', authenticateToken, (req, res) => {
  try {
    const studentCountRow = get('SELECT COUNT(*) as total FROM students');
    const courseCountRow = get('SELECT COUNT(*) as total FROM courses');
    
    const attendanceStats = get(`
      SELECT 
        COUNT(id) as total_attendance,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as total_present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as total_absent
      FROM attendance
    `);

    const totalStudents = studentCountRow ? studentCountRow.total : 0;
    const totalCourses = courseCountRow ? courseCountRow.total : 0;
    const totalAttendance = Number(attendanceStats?.total_attendance) || 0;
    const totalPresent = Number(attendanceStats?.total_present) || 0;
    const totalAbsent = Number(attendanceStats?.total_absent) || 0;
    const generalRate = totalAttendance > 0 ? Math.round((totalPresent / totalAttendance) * 100) : 0;

    // Registros recentes
    const recentRecords = all(`
      SELECT 
        a.id,
        a.date,
        a.status,
        a.notes,
        a.created_at,
        s.id as student_id,
        s.name as student_name,
        c.id as course_id,
        c.title as course_title,
        COALESCE(u.name, 'Sistema') as registered_by
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      JOIN courses c ON a.course_id = c.id
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.id DESC
      LIMIT 8
    `);

    // Distribuição por curso
    const courseSummary = all(`
      SELECT 
        c.id,
        c.title,
        COUNT(a.id) as total,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent
      FROM courses c
      LEFT JOIN attendance a ON c.id = a.course_id
      GROUP BY c.id
      ORDER BY total DESC
      LIMIT 5
    `).map(c => ({
      id: c.id,
      title: c.title,
      total: Number(c.total) || 0,
      present: Number(c.present) || 0,
      absent: Number(c.absent) || 0,
      rate: Number(c.total) > 0 ? Math.round((Number(c.present) / Number(c.total)) * 100) : 0
    }));

    return res.status(200).json({
      totalStudents,
      totalCourses,
      totalAttendance,
      totalPresent,
      totalAbsent,
      generalRate,
      recentRecords,
      courseSummary
    });
  } catch (err) {
    console.error('Erro ao carregar dados do dashboard:', err);
    return res.status(500).json({ error: 'Erro ao obter dados do dashboard' });
  }
});

// Rotas da API
app.use('/api/auth', authRouter);
app.use('/api/students', studentsRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/history', historyRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/users', usersRouter);
app.use('/api/audit', auditRouter);

// Rota de fallback para SPA (qualquer GET que não seja /api serve index.html)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Tratamento centralizado de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado na aplicação:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno no servidor'
  });
});

// Início do servidor apenas se executado diretamente
const isDirectRun = process.argv[1] && process.argv[1].endsWith('server.js');
if (isDirectRun && process.env.NODE_ENV !== 'test') {
  dbInitPromise.then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(`🎓 Gerenciador de Presença de Alunos em execução`);
      console.log(`🌐 Servidor rodando em: http://0.0.0.0:${PORT}`);
      console.log(`====================================================`);
    });
  });
}

export default app;
