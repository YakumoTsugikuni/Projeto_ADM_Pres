import request from 'supertest';
import app from '../server.js';
import { initDb, all } from '../db.js';

describe('Controle de Presença e Auditoria', () => {
  let adminToken = '';
  let studentId = 0;
  let courseId = 0;

  beforeAll(async () => {
    await initDb();

    // Login do admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: process.env.FIRST_ADMIN_PASSWORD || 'Admin123!'
      });

    adminToken = loginRes.body.token;

    // Criar aluno para o teste
    const studentRes = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Aluno Presenca Teste',
        email: `presenca_${Date.now()}@escola.com`,
        age: 17
      });
    studentId = studentRes.body.student.id;

    // Criar curso para o teste
    const courseRes = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'História do Brasil',
        duration: 45,
        description: 'Curso teste'
      });
    courseId = courseRes.body.course.id;
  });

  test('Não deve permitir registrar presença em datas futuras', async () => {
    // Gerar data futura (ano 2099)
    const futureDate = '2099-12-31';

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        student_id: studentId,
        course_id: courseId,
        date: futureDate,
        status: 'present',
        notes: 'Tentativa futura'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Não é permitido registrar presença em datas futuras');
  });

  test('Deve registrar presença com sucesso em data válida', async () => {
    const validDate = '2026-01-10';

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        student_id: studentId,
        course_id: courseId,
        date: validDate,
        status: 'present',
        notes: 'Aluno pontual'
      });

    expect(res.status).toBe(201);
    expect(res.body.attendance).toHaveProperty('status', 'present');
    expect(res.body.attendance).toHaveProperty('notes', 'Aluno pontual');
  });

  test('Deve impedir registros duplicados para o mesmo aluno, curso e data quando allow_update não é enviado', async () => {
    const validDate = '2026-01-10'; // Mesma data do teste anterior

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        student_id: studentId,
        course_id: courseId,
        date: validDate,
        status: 'absent'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Já existe registro de presença para este aluno, curso e data');
    expect(res.body).toHaveProperty('existing_id');
  });

  test('Deve permitir atualizar registros existentes com allow_update: true', async () => {
    const validDate = '2026-01-10';

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        student_id: studentId,
        course_id: courseId,
        date: validDate,
        status: 'absent',
        notes: 'Justificou falta médica',
        allow_update: true
      });

    expect(res.status).toBe(200);
    expect(res.body.attendance).toHaveProperty('status', 'absent');
    expect(res.body.attendance).toHaveProperty('notes', 'Justificou falta médica');
  });

  test('Deve registrar eventos de auditoria (CREATE, UPDATE, DELETE)', async () => {
    const testDate = '2026-01-15';

    // 1. Criar presença
    const createRes = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        student_id: studentId,
        course_id: courseId,
        date: testDate,
        status: 'present',
        notes: 'Criado para auditoria'
      });

    const attendanceId = createRes.body.attendance.id;

    // 2. Atualizar presença
    await request(app)
      .put(`/api/attendance/${attendanceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'absent',
        notes: 'Alterado para auditoria'
      });

    // 3. Excluir presença
    await request(app)
      .delete(`/api/attendance/${attendanceId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Consultar auditoria
    const auditRes = await request(app)
      .get(`/api/audit?student_id=${studentId}&course_id=${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(auditRes.status).toBe(200);
    const logs = auditRes.body.data;
    
    // Verificar se existem ações de CREATE, UPDATE e DELETE registradas
    const actions = logs.map(l => l.action);
    expect(actions).toContain('CREATE');
    expect(actions).toContain('UPDATE');
    expect(actions).toContain('DELETE');
  });
});
