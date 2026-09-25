import express from 'express';
import { get, all, run } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas de presença requerem autenticação
router.use(authenticateToken);

/**
 * Retorna a data atual no formato YYYY-MM-DD
 */
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validação de data não futura
 */
function isFutureDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return true;
  const today = getTodayString();
  return dateStr > today;
}

/**
 * Registra uma entrada na tabela de auditoria
 */
function recordAudit({
  attendanceId,
  action,
  user,
  studentId,
  studentName,
  courseId,
  courseTitle,
  date,
  previousStatus = null,
  newStatus = null,
  notes = null
}) {
  try {
    run(
      `INSERT INTO attendance_audit (
        attendance_id, action, user_id, user_name,
        student_id, student_name, course_id, course_title,
        date, previous_status, new_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attendanceId || null,
        action,
        user.id,
        user.name,
        studentId,
        studentName,
        courseId,
        courseTitle,
        date,
        previousStatus,
        newStatus,
        notes
      ]
    );
  } catch (err) {
    console.error('Falha ao gravar registro de auditoria:', err);
  }
}

/**
 * GET /api/attendance/check
 * Verifica se já existe presença registrada para aluno, curso e data
 */
router.get('/check', (req, res) => {
  try {
    const { student_id, course_id, date } = req.query;
    if (!student_id || !course_id || !date) {
      return res.status(400).json({ error: 'Parâmetros student_id, course_id e date são obrigatórios' });
    }

    const existing = get(
      'SELECT id, status, notes FROM attendance WHERE student_id = ? AND course_id = ? AND date = ?',
      [student_id, course_id, date]
    );

    return res.status(200).json({
      exists: Boolean(existing),
      record: existing || null
    });
  } catch (err) {
    console.error('Erro ao verificar presença:', err);
    return res.status(500).json({ error: 'Erro ao verificar presença' });
  }
});

/**
 * POST /api/attendance
 * Registrar ou atualizar presença de um aluno
 */
router.post('/', (req, res) => {
  try {
    const { student_id, course_id, date, status, notes, allow_update } = req.body;

    if (!student_id || !course_id || !date || !status) {
      return res.status(400).json({
        error: 'Aluno, curso, data e status são obrigatórios'
      });
    }

    // Validar formato de data (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Data inválida. Use o formato AAAA-MM-DD'
      });
    }

    // Não permitir datas futuras
    if (isFutureDate(date)) {
      return res.status(400).json({
        error: 'Não é permitido registrar presença em datas futuras'
      });
    }

    // Normalizar status
    let normalizedStatus = status.toLowerCase();
    if (normalizedStatus === 'presente') normalizedStatus = 'present';
    if (normalizedStatus === 'ausente') normalizedStatus = 'absent';

    if (!['present', 'absent'].includes(normalizedStatus)) {
      return res.status(400).json({
        error: 'Status deve ser "present" ou "absent"'
      });
    }

    // Validar existência do aluno
    const student = get('SELECT id, name FROM students WHERE id = ?', [student_id]);
    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }

    // Validar existência do curso
    const course = get('SELECT id, title FROM courses WHERE id = ?', [course_id]);
    if (!course) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    const cleanNotes = notes && typeof notes === 'string' ? notes.trim() : null;

    // Verificar se já existe registro para esse aluno, curso e data
    const existing = get(
      'SELECT id, status, notes FROM attendance WHERE student_id = ? AND course_id = ? AND date = ?',
      [student_id, course_id, date]
    );

    if (existing) {
      if (!allow_update) {
        return res.status(409).json({
          error: 'Já existe registro de presença para este aluno, curso e data',
          existing_id: existing.id,
          existing_status: existing.status
        });
      }

      // Atualizar registro existente
      run(
        `UPDATE attendance
         SET status = ?, notes = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [normalizedStatus, cleanNotes, req.user.id, existing.id]
      );

      // Registrar auditoria de atualização
      recordAudit({
        attendanceId: existing.id,
        action: 'UPDATE',
        user: req.user,
        studentId: student.id,
        studentName: student.name,
        courseId: course.id,
        courseTitle: course.title,
        date,
        previousStatus: existing.status,
        newStatus: normalizedStatus,
        notes: cleanNotes
      });

      const updatedRecord = get(
        `SELECT a.*, s.name as student_name, c.title as course_title, u.name as user_name
         FROM attendance a
         JOIN students s ON a.student_id = s.id
         JOIN courses c ON a.course_id = c.id
         LEFT JOIN users u ON a.updated_by = u.id
         WHERE a.id = ?`,
        [existing.id]
      );

      return res.status(200).json({
        message: 'Registro de presença atualizado com sucesso',
        attendance: updatedRecord
      });
    }

    // Inserir novo registro
    const { lastInsertRowid } = run(
      `INSERT INTO attendance (student_id, course_id, date, status, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [student_id, course_id, date, normalizedStatus, cleanNotes, req.user.id, req.user.id]
    );

    // Registrar auditoria de criação
    recordAudit({
      attendanceId: lastInsertRowid,
      action: 'CREATE',
      user: req.user,
      studentId: student.id,
      studentName: student.name,
      courseId: course.id,
      courseTitle: course.title,
      date,
      previousStatus: null,
      newStatus: normalizedStatus,
      notes: cleanNotes
    });

    const newRecord = get(
      `SELECT a.*, s.name as student_name, c.title as course_title, u.name as user_name
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       JOIN courses c ON a.course_id = c.id
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = ?`,
      [lastInsertRowid]
    );

    return res.status(201).json({
      message: 'Presença registrada com sucesso',
      attendance: newRecord
    });
  } catch (err) {
    console.error('Erro ao registrar presença:', err);
    return res.status(500).json({ error: 'Erro ao registrar presença' });
  }
});

/**
 * POST /api/attendance/batch
 * Registra ou atualiza presença em lote (chamada completa da turma para uma data)
 */
router.post('/batch', (req, res) => {
  try {
    const { course_id, date, records, allow_update = true } = req.body;

    if (!course_id || !date || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        error: 'Curso, data e lista de registros são obrigatórios'
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Data inválida. Use o formato AAAA-MM-DD'
      });
    }

    if (isFutureDate(date)) {
      return res.status(400).json({
        error: 'Não é permitido registrar presença em datas futuras'
      });
    }

    const course = get('SELECT id, title FROM courses WHERE id = ?', [course_id]);
    if (!course) {
      return res.status(404).json({ error: 'Curso não encontrado' });
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of records) {
      const studentId = item.student_id;
      let status = (item.status || 'present').toLowerCase();
      if (status === 'presente') status = 'present';
      if (status === 'ausente') status = 'absent';
      if (!['present', 'absent'].includes(status)) continue;

      const student = get('SELECT id, name FROM students WHERE id = ?', [studentId]);
      if (!student) continue;

      const cleanNotes = item.notes && typeof item.notes === 'string' ? item.notes.trim() : null;

      const existing = get(
        'SELECT id, status FROM attendance WHERE student_id = ? AND course_id = ? AND date = ?',
        [studentId, course_id, date]
      );

      if (existing) {
        if (allow_update) {
          run(
            `UPDATE attendance
             SET status = ?, notes = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
             WHERE id = ?`,
            [status, cleanNotes, req.user.id, existing.id]
          );

          recordAudit({
            attendanceId: existing.id,
            action: 'UPDATE',
            user: req.user,
            studentId: student.id,
            studentName: student.name,
            courseId: course.id,
            courseTitle: course.title,
            date,
            previousStatus: existing.status,
            newStatus: status,
            notes: cleanNotes
          });
          updatedCount++;
        }
      } else {
        const { lastInsertRowid } = run(
          `INSERT INTO attendance (student_id, course_id, date, status, notes, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [studentId, course_id, date, status, cleanNotes, req.user.id, req.user.id]
        );

        recordAudit({
          attendanceId: lastInsertRowid,
          action: 'CREATE',
          user: req.user,
          studentId: student.id,
          studentName: student.name,
          courseId: course.id,
          courseTitle: course.title,
          date,
          previousStatus: null,
          newStatus: status,
          notes: cleanNotes
        });
        createdCount++;
      }
    }

    return res.status(200).json({
      message: `Chamada processada com sucesso: ${createdCount} criados, ${updatedCount} atualizados`,
      createdCount,
      updatedCount
    });
  } catch (err) {
    console.error('Erro na chamada em lote:', err);
    return res.status(500).json({ error: 'Erro ao processar chamada em lote' });
  }
});

/**
 * PUT /api/attendance/:id
 * Atualiza status e observação de um registro específico de presença
 */
router.put('/:id', (req, res) => {
  try {
    const attendanceId = req.params.id;
    const { status, notes } = req.body;

    const existing = get(
      `SELECT a.*, s.name as student_name, c.title as course_title
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       JOIN courses c ON a.course_id = c.id
       WHERE a.id = ?`,
      [attendanceId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Registro de presença não encontrado' });
    }

    let normalizedStatus = status ? status.toLowerCase() : existing.status;
    if (normalizedStatus === 'presente') normalizedStatus = 'present';
    if (normalizedStatus === 'ausente') normalizedStatus = 'absent';

    if (!['present', 'absent'].includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Status deve ser "present" ou "absent"' });
    }

    const cleanNotes = notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes;

    run(
      `UPDATE attendance
       SET status = ?, notes = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [normalizedStatus, cleanNotes, req.user.id, attendanceId]
    );

    recordAudit({
      attendanceId: existing.id,
      action: 'UPDATE',
      user: req.user,
      studentId: existing.student_id,
      studentName: existing.student_name,
      courseId: existing.course_id,
      courseTitle: existing.course_title,
      date: existing.date,
      previousStatus: existing.status,
      newStatus: normalizedStatus,
      notes: cleanNotes
    });

    const updated = get('SELECT * FROM attendance WHERE id = ?', [attendanceId]);

    return res.status(200).json({
      message: 'Presença atualizada com sucesso',
      attendance: updated
    });
  } catch (err) {
    console.error('Erro ao atualizar presença:', err);
    return res.status(500).json({ error: 'Erro ao atualizar presença' });
  }
});

/**
 * DELETE /api/attendance/:id
 * Exclui registro de presença
 */
router.delete('/:id', (req, res) => {
  try {
    const attendanceId = req.params.id;
    const existing = get(
      `SELECT a.*, s.name as student_name, c.title as course_title
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       JOIN courses c ON a.course_id = c.id
       WHERE a.id = ?`,
      [attendanceId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Registro de presença não encontrado' });
    }

    run('DELETE FROM attendance WHERE id = ?', [attendanceId]);

    recordAudit({
      attendanceId: existing.id,
      action: 'DELETE',
      user: req.user,
      studentId: existing.student_id,
      studentName: existing.student_name,
      courseId: existing.course_id,
      courseTitle: existing.course_title,
      date: existing.date,
      previousStatus: existing.status,
      newStatus: null,
      notes: existing.notes
    });

    return res.status(200).json({
      message: 'Registro de presença excluído com sucesso'
    });
  } catch (err) {
    console.error('Erro ao excluir presença:', err);
    return res.status(500).json({ error: 'Erro ao excluir presença' });
  }
});

export default router;
