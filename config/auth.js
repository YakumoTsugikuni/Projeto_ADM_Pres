/**
 * Configurações de autenticação e segurança
 */
export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'presenca_super_secret_jwt_key_2026_xyz_alunos',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  cookieName: 'presenca_token',
  firstAdmin: {
    username: process.env.FIRST_ADMIN_USERNAME || 'admin',
    password: process.env.FIRST_ADMIN_PASSWORD || 'Admin123!',
    name: process.env.FIRST_ADMIN_NAME || 'Administrador do Sistema',
    role: 'admin'
  },
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
};
