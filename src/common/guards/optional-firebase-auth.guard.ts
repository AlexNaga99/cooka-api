import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { getFirebaseAuth } from '../../config/firebase.config';

@Injectable()
export class OptionalFirebaseAuthGuard implements CanActivate {
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
      // token inválido; segue sem user
    }
    return true;
  }
}
