import express from 'express';
import { all, get } from '../db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/audit
 * Listar registros de auditoria com paginação e filtros
 */
router.get('/', (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      action,
      start_date,
      end_date,
      course_id,
      user_id
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (parsedPage - 1) * parsedLimit;

    const whereClauses = [];
    const params = [];

    if (action) {
      whereClauses.push('action = ?');
      params.push(action.toUpperCase());
    }

    if (start_date) {
      whereClauses.push('date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      whereClauses.push('date <= ?');
      params.push(end_date);
    }

    if (course_id) {
      whereClauses.push('course_id = ?');
      params.push(course_id);
    }

    if (user_id) {
      whereClauses.push('user_id = ?');
      params.push(user_id);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = get(`SELECT COUNT(*) as total FROM attendance_audit ${whereSql}`, params);
    const totalItems = countRow ? countRow.total : 0;
    const totalPages = Math.ceil(totalItems / parsedLimit) || 1;

    const logs = all(
      `SELECT 
        id,
        attendance_id,
        action,
        user_id,
        user_name,
        student_id,
        student_name,
        course_id,
        course_title,
        date,
        previous_status,
        new_status,
        notes,
        created_at
       FROM attendance_audit
       ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, parsedLimit, offset]
    );

    return res.status(200).json({
      data: logs,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: totalItems,
        totalPages
      }
    });
  } catch (err) {
    console.error('Erro ao listar auditoria:', err);
    return res.status(500).json({ error: 'Erro ao buscar registros de auditoria' });
  }
});

export default router;
