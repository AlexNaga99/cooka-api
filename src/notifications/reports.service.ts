import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { toISOString } from '../common/utils/firestore.util';
import { ReportReason, ReportRequestDto, ReportResponseDto } from './dto/report.dto';

const REPORTS_COLLECTION = 'reports';

@Injectable()
export class ReportsService {
  private get db() {
    return getFirestoreDb();
  }

  async reportRecipe(
    reporterId: string,
    recipeId: string,
    dto: ReportRequestDto,
  ): Promise<ReportResponseDto> {
    const recipe = await this.db.collection('recipes').doc(recipeId).get();
    if (!recipe.exists) {
      throw new NotFoundException('Receita não encontrada');
    }

    const existing = await this.db
      .collection(REPORTS_COLLECTION)
      .where('reporterId', '==', reporterId)
      .where('targetType', '==', 'recipe')
      .where('targetId', '==', recipeId)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new ConflictException('Você já denunciou esta receita');
    }

    const ref = this.db.collection(REPORTS_COLLECTION).doc();
    const now = new Date();
    await ref.set({
      reporterId,
      targetType: 'recipe',
      targetId: recipeId,
      reason: dto.reason,
      description: dto.description ?? null,
      status: 'pending',
      createdAt: now,
    });

    return {
      id: ref.id,
      targetType: 'recipe',
      targetId: recipeId,
      reason: dto.reason,
      description: dto.description,
      reporterId,
      createdAt: now.toISOString(),
    };
  }

  async reportUser(
    reporterId: string,
    userId: string,
    dto: ReportRequestDto,
  ): Promise<ReportResponseDto> {
    const user = await this.db.collection('users').doc(userId).get();
    if (!user.exists) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const existing = await this.db
      .collection(REPORTS_COLLECTION)
      .where('reporterId', '==', reporterId)
      .where('targetType', '==', 'user')
      .where('targetId', '==', userId)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new ConflictException('Você já denunciou este usuário');
    }

    const ref = this.db.collection(REPORTS_COLLECTION).doc();
    const now = new Date();
    await ref.set({
      reporterId,
      targetType: 'user',
      targetId: userId,
      reason: dto.reason,
      description: dto.description ?? null,
      status: 'pending',
      createdAt: now,
    });

    return {
      id: ref.id,
      targetType: 'user',
      targetId: userId,
      reason: dto.reason,
      description: dto.description,
      reporterId,
      createdAt: now.toISOString(),
    };
  }
}
