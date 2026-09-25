import express from 'express';
import { stringify } from 'csv-stringify';
import { all, get } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

/**
 * GET /api/reports/summary
 * Resumo geral dos indicadores de presença
 */
router.get('/summary', (req, res) => {
  try {
    const { start_date, end_date, course_id } = req.query;

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

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Totais de alunos e cursos no sistema
    const totalStudentsRow = get('SELECT COUNT(*) as count FROM students');
    const totalCoursesRow = get('SELECT COUNT(*) as count FROM courses');

    // Totais de presenças filtrados
    const attendanceStats = get(
      `SELECT 
        COUNT(a.id) as total_attendance,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count
       FROM attendance a
       ${whereSql}`,
      params
    );

    const totalAttendance = Number(attendanceStats?.total_attendance) || 0;
    const presentCount = Number(attendanceStats?.present_count) || 0;
    const absentCount = Number(attendanceStats?.absent_count) || 0;
    const overallRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

    // Resumo por curso
    const courseBreakdown = all(
      `SELECT 
        c.id,
        c.title,
        COUNT(a.id) as total,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent
       FROM courses c
       LEFT JOIN attendance a ON c.id = a.course_id ${whereSql ? 'AND ' + whereClauses.join(' AND ') : ''}
       GROUP BY c.id
       ORDER BY total DESC, c.title ASC`,
      params
    ).map(c => {
      const tot = Number(c.total) || 0;
      const pres = Number(c.present) || 0;
      return {
        id: c.id,
        title: c.title,
        total: tot,
        present: pres,
        absent: Number(c.absent) || 0,
        rate: tot > 0 ? Math.round((pres / tot) * 100) : 0
      };
    });

    // Tendência diária (últimas 10 datas registradas)
    const dailyTrends = all(
      `SELECT 
        a.date,
        COUNT(a.id) as total,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent
       FROM attendance a
       ${whereSql}
       GROUP BY a.date
       ORDER BY a.date DESC
       LIMIT 10`,
      params
    ).reverse().map(d => {
      const tot = Number(d.total) || 0;
      const pres = Number(d.present) || 0;
      return {
        date: d.date,
        total: tot,
        present: pres,
        absent: Number(d.absent) || 0,
        rate: tot > 0 ? Math.round((pres / tot) * 100) : 0
      };
    });

    return res.status(200).json({
      totalStudents: totalStudentsRow ? totalStudentsRow.count : 0,
      totalCourses: totalCoursesRow ? totalCoursesRow.count : 0,
      totalAttendance,
      presentCount,
      absentCount,
      overallRate,
      courseBreakdown,
      dailyTrends
    });
  } catch (err) {
    console.error('Erro ao gerar resumo de relatórios:', err);
    return res.status(500).json({ error: 'Erro ao gerar resumo de relatórios' });
  }
});

/**
 * GET /api/reports/students
 * Frequência individual de cada aluno com filtros
 */
router.get('/students', (req, res) => {
  try {
    const { start_date, end_date, course_id, student_id, status } = req.query;

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

    if (student_id) {
      whereClauses.push('s.id = ?');
      params.push(student_id);
    }

    if (status) {
      let normalizedStatus = status.toLowerCase();
      if (normalizedStatus === 'presente') normalizedStatus = 'present';
      if (normalizedStatus === 'ausente') normalizedStatus = 'absent';
      whereClauses.push('a.status = ?');
      params.push(normalizedStatus);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        s.id,
        s.name,
        s.email,
        s.age,
        COUNT(a.id) as total_records,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id
      ${whereSql}
      GROUP BY s.id
      ORDER BY s.name ASC
    `;

    const records = all(query, params).map(item => {
      const total = Number(item.total_records) || 0;
      const present = Number(item.present_count) || 0;
      const absent = Number(item.absent_count) || 0;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;

      return {
        id: item.id,
        name: item.name,
        email: item.email,
        age: item.age,
        total_records: total,
        present_count: present,
        absent_count: absent,
        attendance_rate: rate,
        situation: rate >= 75 ? 'Satisfatória' : 'Atenção'
      };
    });

    return res.status(200).json(records);
  } catch (err) {
    console.error('Erro ao buscar frequência individual:', err);
    return res.status(500).json({ error: 'Erro ao gerar relatório individual de alunos' });
  }
});

/**
 * GET /api/reports/export-csv
 * Exportação dos registros de presença para formato CSV
 */
router.get('/export-csv', (req, res) => {
  try {
    const { start_date, end_date, course_id, student_id, user_id, status } = req.query;

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

    if (student_id) {
      whereClauses.push('a.student_id = ?');
      params.push(student_id);
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

    const records = all(
      `SELECT 
        a.id,
        a.date,
        s.name as student_name,
        s.email as student_email,
        s.age as student_age,
        c.title as course_title,
        c.duration as course_duration,
        a.status,
        a.notes,
        COALESCE(u.name, 'Sistema') as registered_by,
        a.created_at,
        a.updated_at
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       JOIN courses c ON a.course_id = c.id
       LEFT JOIN users u ON a.created_by = u.id
       ${whereSql}
       ORDER BY a.date DESC, c.title ASC, s.name ASC`,
      params
    );

    const rows = records.map(r => ({
      ID: r.id,
      Data: r.date,
      Aluno: r.student_name,
      'E-mail do Aluno': r.student_email,
      'Idade': r.student_age,
      Curso: r.course_title,
      'Carga Horária (h)': r.course_duration,
      Status: r.status === 'present' ? 'Presente' : 'Ausente',
      Observações: r.notes || '',
      'Registrado Por': r.registered_by,
      'Criado Em': r.created_at,
      'Atualizado Em': r.updated_at
    }));

    stringify(
      rows,
      {
        header: true,
        bom: true // Adicionar BOM para compatibilidade com Excel e caracteres UTF-8
      },
      (err, output) => {
        if (err) {
          console.error('Erro na serialização CSV:', err);
          return res.status(500).json({ error: 'Erro ao gerar arquivo CSV' });
        }

        const dateSuffix = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="relatorio_presencas_${dateSuffix}.csv"`
        );
        return res.status(200).send(output);
      }
    );
  } catch (err) {
    console.error('Erro ao exportar CSV:', err);
    return res.status(500).json({ error: 'Erro ao exportar registros em CSV' });
  }
});

export default router;
