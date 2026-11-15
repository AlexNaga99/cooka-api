import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Login simples do painel de moderação (site /admin).
 * Credenciais ficam só em variáveis de ambiente (nunca no código):
 *   ADMIN_EMAIL, ADMIN_PASSWORD  -> quem pode entrar
 *   ADMIN_JWT_SECRET (opcional)  -> segredo do token; se faltar, usa JWT_SECRET
 * Sem ADMIN_EMAIL/ADMIN_PASSWORD o login fica desligado.
 */
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

function secret(): string {
  return `admin:${process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET ?? ''}`;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Compara em tempo constante (via hash, assim o tamanho do segredo não vaza). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function adminLoginEnabled(): boolean {
  return !!process.env.ADMIN_EMAIL && !!process.env.ADMIN_PASSWORD && secret().length > 'admin:'.length + 15;
}

export function checkAdminCredentials(email: string, password: string): boolean {
  if (!adminLoginEnabled()) return false;
  const okEmail = safeEqual(email.trim().toLowerCase(), (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase());
  const okPass = safeEqual(password, process.env.ADMIN_PASSWORD ?? '');
  return okEmail && okPass;
}

export function signAdminToken(email: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = b64url(JSON.stringify({ sub: email.trim().toLowerCase(), role: 'admin', exp: expiresAt }));
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function verifyAdminToken(token: string | undefined): { sub: string } | null {
  if (!token || !adminLoginEnabled()) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
      role?: string;
      exp?: number;
    };
    if (data.role !== 'admin' || !data.sub || !data.exp || data.exp < Date.now()) return null;
    // O e-mail do token tem que continuar sendo o admin configurado (trocar ADMIN_EMAIL invalida sessões antigas).
    if (!safeEqual(data.sub, (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase())) return null;
    return { sub: data.sub };
  } catch {
    return null;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const header = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!verifyAdminToken(token)) throw new UnauthorizedException('Sessão de admin inválida ou expirada');
    return true;
  }
}
