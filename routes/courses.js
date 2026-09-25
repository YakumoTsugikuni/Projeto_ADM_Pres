import express from 'express';
import { get, all, run } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas de cursos requerem autenticação
router.use(authenticateToken);

/**
 * Validação de dados do curso
 */
function validateCourseData({ title, duration }) {
  if (!title || typeof title !== 'string' || title.trim().length < 2) {
    return 'O título do curso deve ter no mínimo 2 caracteres';
  }

  const parsedDuration = Number(duration);
  if (isNaN(parsedDuration) || parsedDuration <= 0) {
    return 'A duração do curso deve ser um número maior que zero';
  }

  return null;
}

/**
 * GET /api/courses
 * Listar cursos com contagem de presenças e métricas
 */
router.get('/', (req, res) => {
  try {
    const courses = all(`
      SELECT 
        c.id,
        c.title,
        c.duration,
        c.description,
        c.created_at,
        COUNT(a.id) as total_attendance,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count
      FROM courses c
      LEFT JOIN attendance a ON c.id = a.course_id
      GROUP BY c.id
      ORDER BY c.title ASC
    `).map(course => {
      const total = Number(course.total_attendance) || 0;
      const present = Number(course.present_count) || 0;
      return {
        ...course,
        total_attendance: total,
        present_count: present,
        absent_count: Number(course.absent_count) || 0,
        attendance_rate: total > 0 ? Math.round((present / total) * 100) : 0
      };
    });

    return res.status(200).json(courses);
  } catch (err) {
    console.error('Erro ao listar cursos:', err);
    return res.status(500).json({ error: 'Erro ao listar cursos' });
  }
});

/**
 * GET /api/courses/:id
 * Obter detalhes de um curso
 */
router.get('/:id', (req, res) => {
  try {
    const course = get(
      'SELECT id, title, duration, description, created_at FROM courses WHERE id = ?',
      [req.params.id]
    );

    if (!course) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    return res.status(200).json(course);
  } catch (err) {
    console.error('Erro ao buscar curso:', err);
    return res.status(500).json({ error: 'Erro ao buscar curso' });
  }
});

/**
 * POST /api/courses
 * Criar novo curso
 */
router.post('/', (req, res) => {
  try {
    const { title, duration, description } = req.body;

    const validationError = validateCourseData({ title, duration });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const cleanTitle = title.trim();
    const cleanDuration = Math.round(Number(duration));
    const cleanDesc = description && typeof description === 'string' ? description.trim() : '';

    const { lastInsertRowid } = run(
      'INSERT INTO courses (title, duration, description) VALUES (?, ?, ?)',
      [cleanTitle, cleanDuration, cleanDesc]
    );

    const newCourse = get(
      'SELECT id, title, duration, description, created_at FROM courses WHERE id = ?',
      [lastInsertRowid]
    );

    return res.status(201).json({
      message: 'Curso criado com sucesso',
      course: newCourse
    });
  } catch (err) {
    console.error('Erro ao criar curso:', err);
    return res.status(500).json({ error: 'Erro ao criar curso' });
  }
});

/**
 * PUT /api/courses/:id
 * Atualizar curso existente
 */
router.put('/:id', (req, res) => {
  try {
    const courseId = req.params.id;
    const existing = get('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!existing) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    const { title, duration, description } = req.body;
    const validationError = validateCourseData({ title, duration });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const cleanTitle = title.trim();
    const cleanDuration = Math.round(Number(duration));
    const cleanDesc = description && typeof description === 'string' ? description.trim() : '';

    run(
      'UPDATE courses SET title = ?, duration = ?, description = ? WHERE id = ?',
      [cleanTitle, cleanDuration, cleanDesc, courseId]
    );

    const updated = get(
      'SELECT id, title, duration, description, created_at FROM courses WHERE id = ?',
      [courseId]
    );

    return res.status(200).json({
      message: 'Curso atualizado com sucesso',
      course: updated
    });
  } catch (err) {
    console.error('Erro ao atualizar curso:', err);
    return res.status(500).json({ error: 'Erro ao atualizar curso' });
  }
});

/**
 * DELETE /api/courses/:id
 * Excluir curso (registros de presença são excluídos em cascata)
 */
router.delete('/:id', (req, res) => {
  try {
    const courseId = req.params.id;
    const existing = get('SELECT id, title FROM courses WHERE id = ?', [courseId]);
    if (!existing) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    run('DELETE FROM courses WHERE id = ?', [courseId]);

    return res.status(200).json({
      message: `Curso "${existing.title}" excluído com sucesso`
    });
  } catch (err) {
    console.error('Erro ao excluir curso:', err);
    return res.status(500).json({ error: 'Erro ao excluir curso' });
  }
});

export default router;
