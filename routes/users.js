import express from 'express';
import bcrypt from 'bcryptjs';
import { all, get, run } from '../db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas de gerenciamento de usuários requerem autenticação e privilégio de administrador
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/users
 * Listar todos os usuários cadastrados
 */
router.get('/', (req, res) => {
  try {
    const users = all(`
      SELECT id, username, name, role, is_active, created_at, updated_at
      FROM users
      ORDER BY role ASC, name ASC
    `);
    return res.status(200).json(users);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

/**
 * POST /api/users
 * Criar um novo usuário pelo painel administrativo
 */
router.post('/', (req, res) => {
  try {
    const { username, name, password, role = 'user' } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({
        error: 'Nome de usuário deve conter no mínimo 3 caracteres'
      });
    }

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        error: 'Nome completo deve conter no mínimo 2 caracteres'
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        error: 'A senha provisória deve ter no mínimo 6 caracteres'
      });
    }

    const cleanRole = role === 'admin' ? 'admin' : 'user';
    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();

    const existing = get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existing) {
      return res.status(409).json({ error: 'Este nome de usuário já está em uso' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const { lastInsertRowid } = run(
      `INSERT INTO users (username, name, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [cleanUsername, cleanName, passwordHash, cleanRole]
    );

    const newUser = get(
      'SELECT id, username, name, role, is_active, created_at FROM users WHERE id = ?',
      [lastInsertRowid]
    );

    return res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: newUser
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

/**
 * PUT /api/users/:id
 * Editar nome, username ou papel do usuário
 */
router.put('/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const { name, username, role } = req.body;

    const existing = get('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        error: 'Nome deve ter no mínimo 2 caracteres'
      });
    }

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({
        error: 'Nome de usuário deve ter no mínimo 3 caracteres'
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanRole = role === 'admin' ? 'admin' : 'user';

    // Evitar que o administrador remova seu próprio privilégio de admin
    if (Number(userId) === req.user.id && cleanRole !== 'admin') {
      return res.status(400).json({
        error: 'Você não pode rebaixar seu próprio papel de administrador'
      });
    }

    // Verificar se o nome de usuário colide com outro usuário
    const conflict = get('SELECT id FROM users WHERE username = ? AND id != ?', [
      cleanUsername,
      userId
    ]);
    if (conflict) {
      return res.status(409).json({ error: 'Este nome de usuário já está sendo usado por outro usuário' });
    }

    run(
      `UPDATE users
       SET name = ?, username = ?, role = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [cleanName, cleanUsername, cleanRole, userId]
    );

    const updated = get(
      'SELECT id, username, name, role, is_active, updated_at FROM users WHERE id = ?',
      [userId]
    );

    return res.status(200).json({
      message: 'Usuário atualizado com sucesso',
      user: updated
    });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    return res.status(500).json({ error: 'Erro ao atualizar dados do usuário' });
  }
});

/**
 * PATCH /api/users/:id/status
 * Ativar ou desativar usuário
 */
router.patch('/:id/status', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { is_active } = req.body;

    if (userId === req.user.id) {
      return res.status(400).json({
        error: 'Não é permitido desativar sua própria conta de administrador'
      });
    }

    const user = get('SELECT id, username, is_active FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const newStatus = is_active ? 1 : 0;

    run(
      `UPDATE users
       SET is_active = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [newStatus, userId]
    );

    return res.status(200).json({
      message: `Usuário ${newStatus === 1 ? 'ativado' : 'desativado'} com sucesso`,
      is_active: newStatus
    });
  } catch (err) {
    console.error('Erro ao alterar status do usuário:', err);
    return res.status(500).json({ error: 'Erro ao alterar status do usuário' });
  }
});

/**
 * POST /api/users/:id/reset-password
 * Redefinição de senha de um usuário pelo administrador
 */
router.post('/:id/reset-password', (req, res) => {
  try {
    const userId = req.params.id;
    const { new_password } = req.body;

    if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
      return res.status(400).json({
        error: 'A nova senha deve ter no mínimo 6 caracteres'
      });
    }

    const user = get('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(new_password, salt);

    run(
      `UPDATE users
       SET password_hash = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [hash, userId]
    );

    return res.status(200).json({
      message: `Senha do usuário "${user.username}" redefinida com sucesso`
    });
  } catch (err) {
    console.error('Erro ao redefinir senha do usuário:', err);
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

export default router;
