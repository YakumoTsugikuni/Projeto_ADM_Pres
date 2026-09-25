import express from 'express';
import { all, get } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

/**
 * GET /api/history
 * Listar chamadas agrupadas por curso e data com paginação e filtros
 */
router.get('/', (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      start_date,
      end_date,
      course_id,
      user_id,
      status
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const offset = (parsedPage - 1) * parsedLimit;

    // Condições dinâmicas de filtro
    const whereClauses = [];
    const params = [];

    if (start_date) {
      whereClauses.push('a.date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      whereClauses.push('a.date <= ?');
      params.push(end_date);
    }

    if (course_id) {
      whereClauses.push('a.course_id = ?');
      params.push(course_id);
    }

    if (user_id) {
      whereClauses.push('(a.created_by = ? OR a.updated_by = ?)');
      params.push(user_id, user_id);
    }

    if (status) {
      let normalizedStatus = status.toLowerCase();
      if (normalizedStatus === 'presente') normalizedStatus = 'present';
      if (normalizedStatus === 'ausente') normalizedStatus = 'absent';
      whereClauses.push('a.status = ?');
      params.push(normalizedStatus);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Contagem total de grupos para paginação
    const countSql = `
      SELECT COUNT(*) as total_groups FROM (
        SELECT a.course_id, a.date
        FROM attendance a
        ${whereSql}
        GROUP BY a.course_id, a.date
      )
    `;

    const countResult = get(countSql, params);
    const totalItems = countResult ? countResult.total_groups : 0;
    const totalPages = Math.ceil(totalItems / parsedLimit) || 1;

    // Consulta dos grupos paginados
    const dataSql = `
      SELECT 
        a.course_id,
        c.title as course_title,
        c.duration as course_duration,
        a.date,
        COUNT(a.id) as total_students,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
        MAX(a.updated_at) as last_updated
      FROM attendance a
      JOIN courses c ON a.course_id = c.id
      ${whereSql}
      GROUP BY a.course_id, a.date
      ORDER BY a.date DESC, c.title ASC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, parsedLimit, offset];
    const rawSessions = all(dataSql, dataParams);

    const sessions = rawSessions.map(session => {
      const total = Number(session.total_students) || 0;
      const present = Number(session.present_count) || 0;
      const absent = Number(session.absent_count) || 0;
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

      return {
        course_id: session.course_id,
        course_title: session.course_title,
        course_duration: session.course_duration,
        date: session.date,
        total_students: total,
        present_count: present,
        absent_count: absent,
        attendance_percentage: percentage,
        last_updated: session.last_updated
      };
    });

    return res.status(200).json({
      data: sessions,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: totalItems,
        totalPages
      }
    });
  } catch (err) {
    console.error('Erro ao buscar histórico de chamadas:', err);
    return res.status(500).json({ error: 'Erro ao carregar histórico' });
  }
});

/**
 * GET /api/history/details
 * Visualização detalhada dos alunos e presenças de uma chamada específica
 */
router.get('/details', (req, res) => {
  try {
    const { course_id, date } = req.query;

    if (!course_id || !date) {
      return res.status(400).json({
        error: 'Parâmetros course_id e date são obrigatórios'
      });
    }

    const course = get('SELECT id, title, duration FROM courses WHERE id = ?', [course_id]);
    if (!course) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    const records = all(
      `SELECT 
        a.id,
        a.student_id,
        s.name as student_name,
        s.email as student_email,
        s.age as student_age,
        a.status,
        a.notes,
        a.created_at,
        a.updated_at,
        uc.name as created_by_name,
        uu.name as updated_by_name
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       LEFT JOIN users uc ON a.created_by = uc.id
       LEFT JOIN users uu ON a.updated_by = uu.id
       WHERE a.course_id = ? AND a.date = ?
       ORDER BY s.name ASC`,
      [course_id, date]
    );

    const total = records.length;
    const presentCount = records.filter(r => r.status === 'present').length;
    const absentCount = total - presentCount;
    const percentage = total > 0 ? Math.round((presentCount / total) * 100) : 0;

    return res.status(200).json({
      course,
      date,
      summary: {
        total,
        presentCount,
        absentCount,
        percentage
      },
      records
    });
  } catch (err) {
    console.error('Erro ao obter detalhes da chamada:', err);
    return res.status(500).json({ error: 'Erro ao obter detalhes da chamada' });
  }
});

export default router;
