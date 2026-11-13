import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreDb, getServiceAccountFromEnv } from '../config/firebase.config';
import { VerifyPurchaseRequestDto } from './dto/verify-purchase.dto';

const PURCHASES_COLLECTION = 'iap_purchases';

interface GooglePurchase {
  /** 0 = comprado, 1 = cancelado, 2 = pendente */
  purchaseState?: number;
  /** 0 = não consumido (ok para produto não consumível) */
  consumptionState?: number;
  orderId?: string;
  productId?: string;
}

/**
 * Validação de compra "Remover anúncios".
 * Android: consulta o Google Play Developer API com o purchaseToken (a conta de serviço precisa
 * ter acesso em Play Console > Configurações > Acesso à API).
 * iOS: ainda não configurado (responde 503 verification_unavailable).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly packageName = process.env.ANDROID_PACKAGE_NAME?.trim() || 'com.nmlabs.cooka';
  private readonly removeAdsProductId =
    process.env.IAP_PRODUCT_REMOVE_ADS?.trim() || 'cooka_remove_ads';
  private auth?: GoogleAuth;

  async verifyRemoveAds(uid: string, dto: VerifyPurchaseRequestDto): Promise<{ isAdsFree: true }> {
    if (dto.productId !== this.removeAdsProductId) {
      throw new BadRequestException('Produto inválido');
    }
    if (dto.platform === 'ios') {
      throw this.unavailable('Validação de compras iOS ainda não está configurada');
    }

    const purchase = await this.fetchGooglePurchase(dto.productId, dto.purchaseToken);
    if (purchase.purchaseState !== 0) {
      // 1 = cancelada/estornada, 2 = pendente (ainda não paga)
      throw new ForbiddenException(
        purchase.purchaseState === 2 ? 'Compra pendente de pagamento' : 'Compra inválida ou cancelada',
      );
    }

    await this.bindPurchaseToUser(uid, dto, purchase.orderId);
    await getFirestoreDb().collection('users').doc(uid).set({ isAdsFree: true }, { merge: true });
    this.logger.log(`isAdsFree liberado para uid=${uid} (order=${purchase.orderId ?? 'n/d'})`);
    return { isAdsFree: true };
  }

  /** Um purchaseToken só pode liberar UMA conta (evita compartilhar a compra). */
  private async bindPurchaseToUser(
    uid: string,
    dto: VerifyPurchaseRequestDto,
    orderId?: string,
  ): Promise<void> {
    const db = getFirestoreDb();
    const ref = db
      .collection(PURCHASES_COLLECTION)
      .doc(createHash('sha256').update(dto.purchaseToken).digest('hex'));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        if ((snap.data() as { uid: string }).uid !== uid) {
          throw new ForbiddenException('Esta compra já está vinculada a outra conta');
        }
        return;
      }
      tx.set(ref, {
        uid,
        productId: dto.productId,
        platform: dto.platform,
        orderId: orderId ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  }

  private async fetchGooglePurchase(productId: string, token: string): Promise<GooglePurchase> {
    const url =
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
      `${encodeURIComponent(this.packageName)}/purchases/products/${encodeURIComponent(productId)}` +
      `/tokens/${encodeURIComponent(token)}`;
    try {
      this.auth ??= new GoogleAuth({
        credentials: getServiceAccountFromEnv() as Record<string, unknown>,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });
      const client = await this.auth.getClient();
      const res = await client.request<GooglePurchase>({ url });
      return res.data;
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 400 || status === 404 || status === 410) {
        // token inexistente/expirado/inválido para este app e produto
        throw new ForbiddenException('Compra inválida');
      }
      // 401/403 = conta de serviço sem acesso ao Play Console; demais = indisponibilidade
      this.logger.error(
        `Falha ao consultar o Google Play (status=${status ?? 'n/d'}): ${(e as Error).message}`,
      );
      throw this.unavailable('Validação de compras indisponível no momento');
    }
  }

  private unavailable(message: string): HttpException {
    return new HttpException(
      { statusCode: 503, message, code: 'verification_unavailable' },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
