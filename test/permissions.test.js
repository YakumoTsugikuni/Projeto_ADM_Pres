import request from 'supertest';
import app from '../server.js';
import { initDb } from '../db.js';

describe('Permissões e Controle de Acesso Administrativo', () => {
  let adminToken = '';
  let standardUserToken = '';

  beforeAll(async () => {
    await initDb();

    // Login do admin
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: process.env.FIRST_ADMIN_PASSWORD || 'Admin123!'
      });
    adminToken = adminLoginRes.body.token;

    // Criar e logar usuário comum
    const standardUsername = `comum_${Date.now()}`;
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Usuário Comum',
        username: standardUsername,
        password: 'SenhaComum123!'
      });

    const userLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: standardUsername,
        password: 'SenhaComum123!'
      });
    standardUserToken = userLoginRes.body.token;
  });

  test('Usuário comum NÃO pode listar usuários (/api/users) - deve retornar 403', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${standardUserToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('permissão de administrador');
  });

  test('Usuário comum NÃO pode consultar a tela de auditoria (/api/audit) - deve retornar 403', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${standardUserToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('permissão de administrador');
  });

  test('Administrador PODE listar usuários (/api/users) - deve retornar 200', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Administrador PODE consultar auditoria (/api/audit) - deve retornar 200', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
  });

  test('Administrador pode desativar e ativar um usuário', async () => {
    // Listar usuários para pegar o ID do usuário comum
    const usersRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    const targetUser = usersRes.body.find(u => u.role === 'user');
    expect(targetUser).toBeDefined();

    // Desativar usuário
    const deactivateRes = await request(app)
      .patch(`/api/users/${targetUser.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: 0 });

    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.is_active).toBe(0);

    // Tentar logar com usuário desativado deve falhar (403)
    const loginFailRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: targetUser.username,
        password: 'SenhaComum123!'
      });

    expect(loginFailRes.status).toBe(403);
    expect(loginFailRes.body.error).toContain('desativada');

    // Reativar usuário
    const activateRes = await request(app)
      .patch(`/api/users/${targetUser.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: 1 });

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.is_active).toBe(1);
  });

  test('Administrador não pode desativar sua própria conta', async () => {
    const adminMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    const myId = adminMe.body.user.id;

    const res = await request(app)
      .patch(`/api/users/${myId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('própria conta');
  });
});
