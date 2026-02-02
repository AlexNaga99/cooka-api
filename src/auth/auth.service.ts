import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getFirebaseAuth, getFirestoreDb } from '../config/firebase.config';
import { User } from '../models';
import type { UserResponseDto } from './dto/auth-verify.dto';
import type { AuthRefreshResponseDto } from './dto/auth-verify.dto';

const FIREBASE_SECURE_TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';

@Injectable()
export class AuthService {
  constructor(private readonly configService: ConfigService) {}

  async verifyToken(idToken: string): Promise<{ uid: string; user: UserResponseDto }> {
    const auth = getFirebaseAuth();
    let decoded;
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
    return { uid, user };
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
    const apiKey = this.configService.get<string>('firebase.apiKey');
    if (!apiKey) {
      throw new UnauthorizedException('Refresh token não configurado no servidor');
    }
    const url = `${FIREBASE_SECURE_TOKEN_URL}?key=${apiKey}`;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString();

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new UnauthorizedException(
        err?.error?.message ?? 'Refresh token inválido ou expirado',
      );
    }

    const data = (await res.json()) as {
      id_token: string;
      refresh_token?: string;
      expires_in: string;
    };
    const result: AuthRefreshResponseDto = {
      idToken: data.id_token,
      expiresIn: parseInt(data.expires_in ?? '3600', 10),
    };
    if (data.refresh_token) {
      result.refreshToken = data.refresh_token;
    }
    return result;
  }
}
