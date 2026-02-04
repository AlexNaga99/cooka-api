import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getFirebaseAuth } from '../../config/firebase.config';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token ausente ou inválido');
    }
    const token = authHeader.slice(7);
    try {
      const auth = getFirebaseAuth();
      const decoded = await auth.verifyIdToken(token);
      request.user = {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      };
      return true;
    } catch {
      try {
        const secret = this.configService.get<string>('jwt.secret');
        const payload = this.jwtService.verify<{ sub: string }>(token, { secret });
        request.user = {
          uid: payload.sub,
          email: undefined,
          name: undefined,
          picture: undefined,
        };
        return true;
      } catch {
        throw new UnauthorizedException('Token inválido ou expirado');
      }
    }
  }
}
