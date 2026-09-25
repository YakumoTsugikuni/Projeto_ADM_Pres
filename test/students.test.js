import request from 'supertest';
import app from '../server.js';
import { initDb } from '../db.js';

describe('Gerenciamento de Alunos', () => {
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

  test('Deve cadastrar um aluno válido', async () => {
    const email = `aluno_${Date.now()}@escola.com`;
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Aluno Teste',
        email,
        age: 18
      });

    expect(res.status).toBe(201);
    expect(res.body.student).toHaveProperty('name', 'Aluno Teste');
    expect(res.body.student).toHaveProperty('email', email);
    expect(res.body.student).toHaveProperty('age', 18);
  });

  test('Deve rejeitar aluno com idade menor que 1 ano', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Aluno Bebê',
        email: `bebe_${Date.now()}@escola.com`,
        age: 0
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('entre 1 e 129 anos');
  });

  test('Deve rejeitar aluno com idade maior que 129 anos', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Aluno Ancião',
        email: `anciao_${Date.now()}@escola.com`,
        age: 130
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('entre 1 e 129 anos');
  });

  test('Deve aceitar aluno com idade limite 1 e 129 anos', async () => {
    const res1 = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Aluno Limite Min',
        email: `limite_min_${Date.now()}@escola.com`,
        age: 1
      });
    expect(res1.status).toBe(201);

    const res129 = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Aluno Limite Max',
        email: `limite_max_${Date.now()}@escola.com`,
        age: 129
      });
    expect(res129.status).toBe(201);
  });

  test('Deve impedir e-mails duplicados', async () => {
    const dupEmail = `duplicado_${Date.now()}@escola.com`;

    // Primeiro aluno
    await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Primeiro Aluno',
        email: dupEmail,
        age: 20
      });

    // Segundo aluno com mesmo e-mail
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Segundo Aluno',
        email: dupEmail,
        age: 25
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Já existe um aluno cadastrado com este e-mail');
  });

  test('Deve listar alunos e excluir um aluno', async () => {
    const email = `para_deletar_${Date.now()}@escola.com`;
    const createRes = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Aluno Para Deletar',
        email,
        age: 22
      });

    const studentId = createRes.body.student.id;

    // Listar
    const listRes = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);

    // Deletar
    const delRes = await request(app)
      .delete(`/api/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);

    // Verificar se não existe mais
    const getRes = await request(app)
      .get(`/api/students/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);
  });
});
