import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getFirebaseAuth } from '../../config/firebase.config';

@Injectable()
export class OptionalFirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return true;
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
      } catch {
        // token inválido; segue sem user
      }
    }
    return true;
  }
}
