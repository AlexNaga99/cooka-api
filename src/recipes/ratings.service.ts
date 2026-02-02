import { Injectable, NotFoundException } from '@nestjs/common';
import { getFirestoreDb } from '../config/firebase.config';
import { AuthService } from '../auth/auth.service';
import type { RateResponseDto, CommentResponseDto } from './dto/rate-comment.dto';
import type { User } from '../models/user.model';

@Injectable()
export class RatingsService {
  constructor(private readonly authService: AuthService) {}

  private get db() {
    return getFirestoreDb();
  }

  async rate(recipeId: string, userId: string, stars: number): Promise<RateResponseDto> {
    const recipeRef = this.db.collection('recipes').doc(recipeId);
    const recipe = await recipeRef.get();
    if (!recipe.exists) throw new NotFoundException('Receita não encontrada');

    const ratingQuery = await this.db
      .collection('ratings')
      .where('recipeId', '==', recipeId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    const batch = this.db.batch();

    if (ratingQuery.empty) {
      const ratingRef = this.db.collection('ratings').doc();
      batch.set(ratingRef, { recipeId, userId, stars });
    } else {
      batch.update(ratingQuery.docs[0].ref, { stars });
    }

    const allRatings = await this.db.collection('ratings').where('recipeId', '==', recipeId).get();
    const starValues = allRatings.docs.map((d) => (d.data() as { stars: number }).stars);
    if (!ratingQuery.empty) {
      const existingId = ratingQuery.docs[0].id;
      const idx = allRatings.docs.findIndex((d) => d.id === existingId);
      if (idx >= 0) starValues[idx] = stars;
    } else {
      starValues.push(stars);
    }
    const ratingAvg = starValues.length ? starValues.reduce((a, b) => a + b, 0) / starValues.length : 0;
    const ratingsCount = starValues.length;
    batch.update(recipeRef, { ratingAvg, ratingsCount });
    await batch.commit();

    return { recipeId, userId, stars, ratingAvg, ratingsCount };
  }

  async comment(recipeId: string, authorId: string, text: string): Promise<CommentResponseDto> {
    const recipe = await this.db.collection('recipes').doc(recipeId).get();
    if (!recipe.exists) throw new NotFoundException('Receita não encontrada');

    const ref = this.db.collection('comments').doc();
    const now = new Date();
    await ref.set({ recipeId, authorId, text, createdAt: now });

    const userDoc = await this.db.collection('users').doc(authorId).get();
    const author = userDoc.exists
      ? this.authService.toUserResponse(userDoc.data() as User & { createdAt?: { toDate: () => Date } }, authorId)
      : undefined;

    return {
      id: ref.id,
      recipeId,
      authorId,
      text,
      createdAt: now.toISOString(),
      author,
    };
  }
}
