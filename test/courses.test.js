import request from 'supertest';
import app from '../server.js';
import { initDb } from '../db.js';

describe('Gerenciamento de Cursos', () => {
  let adminToken = '';

  beforeAll(async () => {
    await initDb();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: process.env.FIRST_ADMIN_PASSWORD || 'Admin123!'
      });

    adminToken = loginRes.body.token;
  });

  test('Deve criar um curso válido', async () => {
    const res = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Física Clássica',
        duration: 60,
        description: 'Introdução à mecânica Newtoniana'
      });

    expect(res.status).toBe(201);
    expect(res.body.course).toHaveProperty('title', 'Física Clássica');
    expect(res.body.course).toHaveProperty('duration', 60);
  });

  test('Deve validar duração maior que zero (rejeitar zero ou negativa)', async () => {
    const resZero = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Curso Duração Zero',
        duration: 0,
        description: 'Teste de duração inválida'
      });

    expect(resZero.status).toBe(400);
    expect(resZero.body.error).toContain('maior que zero');

    const resNeg = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Curso Duração Negativa',
        duration: -10,
        description: 'Teste negativo'
      });

    expect(resNeg.status).toBe(400);
    expect(resNeg.body.error).toContain('maior que zero');
  });

  test('Deve listar e excluir cursos', async () => {
    const createRes = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Curso Para Exclusão',
        duration: 30,
        description: 'Temporário'
      });

    const courseId = createRes.body.course.id;

    const listRes = await request(app)
      .get('/api/courses')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.some(c => c.id === courseId)).toBe(true);

    const delRes = await request(app)
      .delete(`/api/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(404);
  });
});
