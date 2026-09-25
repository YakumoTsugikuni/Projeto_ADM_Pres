import request from 'supertest';
import app from '../server.js';
import { initDb } from '../db.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Autenticação e Rate Limiting', () => {
  beforeAll(async () => {
    await initDb();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  test('Deve logar com o administrador inicial e retornar cookie HttpOnly', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: process.env.FIRST_ADMIN_PASSWORD || 'Admin123!'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('role', 'admin');
    
    // Verificar se o cookie HttpOnly foi definido
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const tokenCookie = cookies.find(c => c.startsWith('presenca_token='));
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie.toLowerCase()).toContain('httponly');
    expect(tokenCookie.toLowerCase()).toContain('samesite=lax');
  });

  test('Deve falhar ao logar com credenciais inválidas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'senha_errada_123'
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Credenciais inválidas');
  });

  test('Deve validar senha com no mínimo 6 caracteres no cadastro', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Professor Teste',
        username: 'prof_teste_curto',
        password: '123' // Menos de 6 caracteres
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('mínimo 6 caracteres');
  });

  test('Deve cadastrar novo usuário/responsável com sucesso', async () => {
    const uniqueUsername = `resp_${Date.now()}`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Responsável Aluno',
        username: uniqueUsername,
        password: 'SenhaSegura123!'
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty('username', uniqueUsername);
    expect(res.body.user).toHaveProperty('role', 'user');
  });

  test('Deve impedir cadastro com nome de usuário duplicado', async () => {
    const username = `dup_${Date.now()}`;

    // Primeiro cadastro
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Primeiro Cadastro',
        username,
        password: 'SenhaValida123!'
      });

    // Tentativa duplicada
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Segundo Cadastro',
        username,
        password: 'SenhaValida123!'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('já está em uso');
  });

  test('Deve aplicar Rate Limit após exceder limite de tentativas de login', async () => {
    // Fazer 11 requisições para estourar o limite de 10 tentativas
    let lastResponse;
    for (let i = 0; i < 11; i++) {
      lastResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'senha_incorreta'
        });
    }

    expect(lastResponse.status).toBe(429);
    expect(lastResponse.body).toHaveProperty('error');
    expect(lastResponse.body.error).toContain('Muitas tentativas');
  });

  test('Deve obter os dados do usuário conectado via /api/auth/me', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: process.env.FIRST_ADMIN_PASSWORD || 'Admin123!'
      });

    const token = loginRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toHaveProperty('username', 'admin');
    expect(meRes.body.user).toHaveProperty('role', 'admin');
  });
});
