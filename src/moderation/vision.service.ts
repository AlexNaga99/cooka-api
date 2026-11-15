import { Injectable } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { getServiceAccountFromEnv } from '../config/firebase.config';

export type Verdict = 'approved' | 'review' | 'rejected';

type Likelihood = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';
const RANK: Record<Likelihood, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  VERY_LIKELY: 5,
};

interface SafeSearch {
  adult?: Likelihood;
  violence?: Likelihood;
  racy?: Likelihood;
  medical?: Likelihood;
}

/** Converte URL do Firebase Storage em gs://bucket/objeto (sem baixar a imagem). */
export function toGcsUri(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'firebasestorage.googleapis.com') {
      const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (m) return `gs://${m[1]}/${decodeURIComponent(m[2])}`;
    }
    if (u.hostname === 'storage.googleapis.com') {
      const [, bucket, ...rest] = u.pathname.split('/');
      if (bucket && rest.length) return `gs://${bucket}/${decodeURIComponent(rest.join('/'))}`;
    }
    if (u.hostname.endsWith('.firebasestorage.app')) {
      const path = u.pathname.replace(/^\//, '');
      if (path) return `gs://${u.hostname}/${decodeURIComponent(path)}`;
    }
  } catch {
    /* url inválida */
  }
  return null;
}

/**
 * Decisão sobre o resultado do SafeSearch. Foto de comida pode dar "racy"/"violence" falso
 * (carne crua, molho vermelho), então só o extremo reprova direto; o duvidoso vai para revisão.
 */
export function judge(s: SafeSearch): Verdict {
  const r = (v?: Likelihood) => RANK[v ?? 'UNKNOWN'];
  if (r(s.adult) >= RANK.LIKELY || r(s.violence) >= RANK.VERY_LIKELY) return 'rejected';
  if (
    r(s.adult) >= RANK.POSSIBLE ||
    r(s.violence) >= RANK.LIKELY ||
    r(s.racy) >= RANK.LIKELY ||
    r(s.medical) >= RANK.VERY_LIKELY
  ) {
    return 'review';
  }
  return 'approved';
}

const ORDER: Verdict[] = ['approved', 'review', 'rejected'];

@Injectable()
export class VisionService {
  private auth?: GoogleAuth;

  /** Pior veredito entre as imagens. Lança erro se a API falhar (a receita continua pendente e é retentada). */
  async analyze(urls: string[]): Promise<{ verdict: Verdict; detail: unknown[] }> {
    let worst: Verdict = 'approved';
    const detail: unknown[] = [];
    for (const url of urls) {
      const uri = toGcsUri(url);
      if (!uri) {
        worst = this.max(worst, 'review');
        detail.push({ url, reason: 'url_nao_reconhecida' });
        continue;
      }
      const safe = await this.safeSearch(uri);
      const verdict = judge(safe);
      detail.push({ uri, ...safe, verdict });
      worst = this.max(worst, verdict);
    }
    return { verdict: worst, detail };
  }

  /** Analisa bytes de uma imagem local (usado só pelo script de teste `moderation:check-image`). */
  async analyzeBytes(bytes: Buffer): Promise<{ safe: SafeSearch; verdict: Verdict }> {
    const safe = await this.safeSearchRequest({ content: bytes.toString('base64') });
    return { safe, verdict: judge(safe) };
  }

  private max(a: Verdict, b: Verdict): Verdict {
    return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
  }

  private safeSearch(gcsUri: string): Promise<SafeSearch> {
    return this.safeSearchRequest({ source: { gcsImageUri: gcsUri } });
  }

  /** Analisa uma foto de perfil por URL (Firebase Storage via gs://, qualquer outra via https). */
  async analyzeUrl(url: string): Promise<{ safe: SafeSearch; verdict: Verdict }> {
    const uri = toGcsUri(url);
    const image = uri ? { source: { gcsImageUri: uri } } : { source: { imageUri: url } };
    const safe = await this.safeSearchRequest(image);
    return { safe, verdict: judge(safe) };
  }

  private async safeSearchRequest(
    image: { content: string } | { source: { gcsImageUri: string } } | { source: { imageUri: string } },
  ): Promise<SafeSearch> {
    if (!this.auth) {
      this.auth = new GoogleAuth({
        credentials: getServiceAccountFromEnv() as Record<string, unknown>,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }
    const client = await this.auth.getClient();
    const res = await client.request<{
      responses?: Array<{ safeSearchAnnotation?: SafeSearch; error?: { message?: string } }>;
    }>({
      url: 'https://vision.googleapis.com/v1/images:annotate',
      method: 'POST',
      data: {
        requests: [
          { image, features: [{ type: 'SAFE_SEARCH_DETECTION' }] },
        ],
      },
      timeout: 20_000,
    });
    const first = res.data.responses?.[0];
    if (first?.error) throw new Error(`Vision: ${first.error.message}`);
    if (!first?.safeSearchAnnotation) throw new Error('Vision: resposta sem safeSearchAnnotation');
    return first.safeSearchAnnotation;
  }
}
