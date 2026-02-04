import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../config/firebase.config';
import { User } from '../models';
import type {
  AuthRefreshResponseDto,
  AuthVerifyResponseDto,
  UserResponseDto,
} from './dto/auth-verify.dto';

const BACKEND_REFRESH_TOKEN_PREFIX = 'ct_';
const REFRESH_TOKENS_COLLECTION = 'refresh_tokens';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async verifyToken(idToken: string): Promise<AuthVerifyResponseDto> {
    const auth = getFirebaseAuth();
    let decoded: { uid: string; exp?: number; name?: string; email?: string; picture?: string };
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    const uid = decoded.uid;
    const db = getFirestoreDb();
    const userDoc = await db.collection('users').doc(uid).get();
    let user: UserResponseDto;
    if (userDoc.exists) {
      const data = userDoc.data() as User & { createdAt?: { toDate: () => Date } };
      user = this.toUserResponse(data, uid);
    } else {
      user = {
        id: uid,
        name: decoded.name ?? '',
        email: decoded.email ?? '',
        photoUrl: decoded.picture ?? null,
        followersCount: 0,
        followingCount: 0,
        popularityScore: 0,
        createdAt: new Date().toISOString(),
        isAdsFree: false,
      };
    }

    const expiresIn = decoded.exp
      ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000))
      : 3600;
    const refreshToken = this.createBackendRefreshToken(uid, db);
    return {
      uid,
      user,
      idToken,
      refreshToken,
      expiresIn,
    };
  }

  private createBackendRefreshToken(uid: string, db: ReturnType<typeof getFirestoreDb>): string {
    const token = BACKEND_REFRESH_TOKEN_PREFIX + randomBytes(32).toString('hex');
    const expiresDays = this.configService.get<number>('refreshToken.expiresDays') ?? 30;
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000),
    );
    db.collection(REFRESH_TOKENS_COLLECTION).doc(token).set({ uid, expiresAt });
    return token;
  }

  toUserResponse(data: User & { createdAt?: { toDate?: () => Date } }, id: string): UserResponseDto {
    const createdAt = data.createdAt as unknown;
    const dateStr =
      typeof createdAt === 'object' &&
      createdAt !== null &&
      'toDate' in createdAt &&
      typeof (createdAt as { toDate: () => Date }).toDate === 'function'
        ? (createdAt as { toDate: () => Date }).toDate().toISOString()
        : createdAt instanceof Date
          ? createdAt.toISOString()
          : new Date().toISOString();
    return {
      id: id ?? (data as User & { id?: string }).id,
      name: data.name,
      email: data.email,
      photoUrl: data.photoUrl ?? null,
      followersCount: data.followersCount ?? 0,
      followingCount: data.followingCount ?? 0,
      popularityScore: data.popularityScore ?? 0,
      createdAt: dateStr,
      isAdsFree: data.isAdsFree ?? false,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthRefreshResponseDto> {
    if (!refreshToken.startsWith(BACKEND_REFRESH_TOKEN_PREFIX)) {
      throw new UnauthorizedException('Refresh token inválido (use o token retornado pelo POST /auth/verify)');
    }
    return this.refreshWithBackendToken(refreshToken);
  }

  private async refreshWithBackendToken(token: string): Promise<AuthRefreshResponseDto> {
    const db = getFirestoreDb();
    const doc = await db.collection(REFRESH_TOKENS_COLLECTION).doc(token).get();
    if (!doc.exists) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
    const data = doc.data() as { uid: string; expiresAt: { toDate: () => Date } };
    const expiresAt = data.expiresAt?.toDate?.() ?? new Date(0);
    if (expiresAt <= new Date()) {
      await db.collection(REFRESH_TOKENS_COLLECTION).doc(token).delete();
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
    const uid = data.uid;
    const accessToken = this.jwtService.sign(
      { sub: uid },
      { expiresIn: 3600 },
    );
    const expiresInSeconds = 3600;

    const newRefreshToken = this.createBackendRefreshToken(uid, db);
    await db.collection(REFRESH_TOKENS_COLLECTION).doc(token).delete();

    return {
      idToken: accessToken,
      refreshToken: newRefreshToken,
      expiresIn: expiresInSeconds,
    };
  }

}
