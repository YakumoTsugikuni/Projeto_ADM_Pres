/**
 * Middleware simples e eficiente de Rate Limiting em memória
 */

const hitRecords = new Map();

/**
 * Cria um middleware de rate limit com janela deslizante/tempo de expiração
 * @param {Object} options
 * @param {number} options.windowMs - Janela em milissegundos
 * @param {number} options.max - Número máximo de requisições por janela
 * @param {string} options.message - Mensagem retornada em caso de bloqueio
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = 'Muitas tentativas. Por favor, aguarde alguns minutos e tente novamente.'
} = {}) {
  return function rateLimiter(req, res, next) {
    const ip =
      req.ip ||
      req.headers['x-forwarded-for'] ||
      req.connection?.remoteAddress ||
      'unknown-ip';

    const key = `${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();

    const record = hitRecords.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }

    hitRecords.set(key, record);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      return res.status(429).json({
        error: message,
        retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    next();
  };
}

/**
 * Limpa todos os limites (útil para testes)
 */
export function resetRateLimits() {
  hitRecords.clear();
}

// Limitador de Login: 10 tentativas a cada 10 minutos
export const loginRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Muitas tentativas de login. Por favor, aguarde 10 minutos antes de tentar novamente.'
});

// Limitador de Cadastro: 5 cadastros a cada 15 minutos
export const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Limite de cadastros excedido para este endereço. Aguarde alguns minutos.'
});
