import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';
import { get } from '../db.js';

/**
 * Middleware para validar o token JWT (via Cookie HttpOnly ou Header Authorization)
 */
export function authenticateToken(req, res, next) {
  let token = null;

  // 1. Tentar ler do cookie seguro
  if (req.cookies && req.cookies[authConfig.cookieName]) {
    token = req.cookies[authConfig.cookieName];
  }

  // 2. Se não estiver no cookie, tentar o header Authorization
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({
      error: 'Acesso não autorizado: token de autenticação não fornecido'
    });
  }

  jwt.verify(token, authConfig.jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        error: 'Sessão inválida ou expirada. Faça login novamente.'
      });
    }

    try {
      // Buscar usuário no banco para garantir que ainda existe e está ativo
      const user = get(
        'SELECT id, username, name, role, is_active FROM users WHERE id = ?',
        [decoded.id]
      );

      if (!user) {
        return res.status(401).json({
          error: 'Usuário não encontrado'
        });
      }

      if (user.is_active !== 1) {
        return res.status(403).json({
          error: 'Sua conta de usuário foi desativada. Contate o administrador.'
        });
      }

      req.user = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      };

      next();
    } catch (dbErr) {
      console.error('Erro na autenticação ao verificar usuário:', dbErr);
      return res.status(500).json({ error: 'Erro interno ao autenticar usuário' });
    }
  });
}

/**
 * Middleware para restringir acesso apenas a administradores
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Acesso negado: permissão de administrador necessária'
    });
  }
  next();
}
