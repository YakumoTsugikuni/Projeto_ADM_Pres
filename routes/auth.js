import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';
import { get, run } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { loginRateLimiter, registerRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Cadastro de novos usuários / responsáveis
 */
router.post('/register', registerRateLimiter, async (req, res) => {
  try {
    const { username, name, password } = req.body;

    // Validações
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({
        error: 'Nome de usuário é obrigatório e deve ter no mínimo 3 caracteres'
      });
    }

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        error: 'Nome completo é obrigatório e deve ter no mínimo 2 caracteres'
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        error: 'A senha deve ter no mínimo 6 caracteres'
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();

    // Verificar unicidade de nome de usuário
    const existing = get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existing) {
      return res.status(409).json({
        error: 'Este nome de usuário já está em uso'
      });
    }

    // Hash da senha com bcrypt
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const { lastInsertRowid } = run(
      `INSERT INTO users (username, name, password_hash, role, is_active)
       VALUES (?, ?, ?, 'user', 1)`,
      [cleanUsername, cleanName, passwordHash]
    );

    return res.status(201).json({
      message: 'Usuário cadastrado com sucesso',
      user: {
        id: lastInsertRowid,
        username: cleanUsername,
        name: cleanName,
        role: 'user'
      }
    });
  } catch (err) {
    console.error('Erro no registro de usuário:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar usuário' });
  }
});

/**
 * POST /api/auth/login
 * Autenticação e emissão de JWT em cookie HttpOnly e no corpo JSON
 */
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Usuário e senha são obrigatórios'
      });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const user = get(
      'SELECT id, username, name, password_hash, role, is_active FROM users WHERE username = ?',
      [cleanUsername]
    );

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (user.is_active !== 1) {
      return res.status(403).json({
        error: 'Esta conta está desativada. Entre em contato com a administração.'
      });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };

    const token = jwt.sign(tokenPayload, authConfig.jwtSecret, {
      expiresIn: authConfig.jwtExpiresIn
    });

    // Enviar cookie HttpOnly com SameSite=Lax
    res.cookie(authConfig.cookieName, token, authConfig.cookieOptions);

    return res.status(200).json({
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro ao autenticar' });
  }
});

/**
 * POST /api/auth/logout
 * Encerramento da sessão e limpeza do cookie
 */
router.post('/logout', (req, res) => {
  res.clearCookie(authConfig.cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
  return res.status(200).json({ message: 'Logout realizado com sucesso' });
});

/**
 * GET /api/auth/me
 * Retorna os dados do usuário autenticado atual
 */
router.get('/me', authenticateToken, (req, res) => {
  return res.status(200).json({
    user: req.user
  });
});

/**
 * PUT /api/auth/change-password
 * Permite que o usuário conectado altere sua própria senha
 */
router.put('/change-password', authenticateToken, (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        error: 'Senha atual e nova senha são obrigatórias'
      });
    }

    if (typeof new_password !== 'string' || new_password.length < 6) {
      return res.status(400).json({
        error: 'A nova senha deve ter no mínimo 6 caracteres'
      });
    }

    const user = get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const matches = bcrypt.compareSync(current_password, user.password_hash);
    if (!matches) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(new_password, salt);

    run(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
      [newHash, req.user.id]
    );

    return res.status(200).json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('Erro ao alterar senha:', err);
    return res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

export default router;
