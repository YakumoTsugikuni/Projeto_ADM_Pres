import express from 'express';
import { get, all, run } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas de alunos requerem autenticação
router.use(authenticateToken);

/**
 * Validação de dados do aluno
 */
function validateStudentData({ name, email, age }) {
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return 'O nome do aluno deve ter no mínimo 2 caracteres';
  }

  if (!email || typeof email !== 'string') {
    return 'E-mail é obrigatório';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return 'Formato de e-mail inválido';
  }

  const parsedAge = Number(age);
  if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 129) {
    return 'A idade do aluno deve ser um número inteiro entre 1 e 129 anos';
  }

  return null;
}

/**
 * GET /api/students
 * Listar alunos com busca opcional e contagem de presenças/ausências
 */
router.get('/', (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT 
        s.id,
        s.name,
        s.email,
        s.age,
        s.created_at,
        COUNT(a.id) as total_attendance,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` WHERE s.name LIKE ? OR s.email LIKE ? `;
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += ` GROUP BY s.id ORDER BY s.name ASC`;

    const students = all(query, params).map(student => {
      const total = Number(student.total_attendance) || 0;
      const present = Number(student.present_count) || 0;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;
      return {
        ...student,
        total_attendance: total,
        present_count: present,
        absent_count: Number(student.absent_count) || 0,
        attendance_rate: rate
      };
    });

    return res.status(200).json(students);
  } catch (err) {
    console.error('Erro ao buscar alunos:', err);
    return res.status(500).json({ error: 'Erro ao listar alunos' });
  }
});

/**
 * GET /api/students/:id
 * Obter dados de um aluno específico com histórico resumido
 */
router.get('/:id', (req, res) => {
  try {
    const student = get(
      'SELECT id, name, email, age, created_at FROM students WHERE id = ?',
      [req.params.id]
    );

    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }

    const attendanceRecords = all(
      `SELECT a.id, a.date, a.status, a.notes, c.title as course_title
       FROM attendance a
       JOIN courses c ON a.course_id = c.id
       WHERE a.student_id = ?
       ORDER BY a.date DESC LIMIT 50`,
      [req.params.id]
    );

    return res.status(200).json({
      ...student,
      attendance: attendanceRecords
    });
  } catch (err) {
    console.error('Erro ao obter aluno:', err);
    return res.status(500).json({ error: 'Erro ao obter dados do aluno' });
  }
});

/**
 * POST /api/students
 * Criar novo aluno
 */
router.post('/', (req, res) => {
  try {
    const { name, email, age } = req.body;

    const validationError = validateStudentData({ name, email, age });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const parsedAge = parseInt(age, 10);

    // Verificar unicidade de e-mail
    const existing = get('SELECT id FROM students WHERE email = ?', [cleanEmail]);
    if (existing) {
      return res.status(409).json({
        error: 'Já existe um aluno cadastrado com este e-mail'
      });
    }

    const { lastInsertRowid } = run(
      'INSERT INTO students (name, email, age) VALUES (?, ?, ?)',
      [cleanName, cleanEmail, parsedAge]
    );

    const newStudent = get('SELECT id, name, email, age, created_at FROM students WHERE id = ?', [
      lastInsertRowid
    ]);

    return res.status(201).json({
      message: 'Aluno cadastrado com sucesso',
      student: newStudent
    });
  } catch (err) {
    console.error('Erro ao cadastrar aluno:', err);
    return res.status(500).json({ error: 'Erro interno ao cadastrar aluno' });
  }
});

/**
 * PUT /api/students/:id
 * Atualizar dados do aluno
 */
router.put('/:id', (req, res) => {
  try {
    const studentId = req.params.id;
    const existingStudent = get('SELECT id FROM students WHERE id = ?', [studentId]);
    if (!existingStudent) {
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }

    const { name, email, age } = req.body;
    const validationError = validateStudentData({ name, email, age });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const parsedAge = parseInt(age, 10);

    // Verificar se outro aluno possui este e-mail
    const emailConflict = get('SELECT id FROM students WHERE email = ? AND id != ?', [
      cleanEmail,
      studentId
    ]);
    if (emailConflict) {
      return res.status(409).json({
        error: 'Já existe outro aluno cadastrado com este e-mail'
      });
    }

    run('UPDATE students SET name = ?, email = ?, age = ? WHERE id = ?', [
      cleanName,
      cleanEmail,
      parsedAge,
      studentId
    ]);

    const updated = get('SELECT id, name, email, age, created_at FROM students WHERE id = ?', [
      studentId
    ]);

    return res.status(200).json({
      message: 'Aluno atualizado com sucesso',
      student: updated
    });
  } catch (err) {
    console.error('Erro ao atualizar aluno:', err);
    return res.status(500).json({ error: 'Erro ao atualizar aluno' });
  }
});

/**
 * DELETE /api/students/:id
 * Excluir aluno (registros de presença são excluídos em cascata)
 */
router.delete('/:id', (req, res) => {
  try {
    const studentId = req.params.id;
    const existing = get('SELECT id, name FROM students WHERE id = ?', [studentId]);
    if (!existing) {
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }

    run('DELETE FROM students WHERE id = ?', [studentId]);

    return res.status(200).json({
      message: `Aluno "${existing.name}" excluído com sucesso`
    });
  } catch (err) {
    console.error('Erro ao excluir aluno:', err);
    return res.status(500).json({ error: 'Erro ao excluir aluno' });
  }
});

export default router;
