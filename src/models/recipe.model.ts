import { User } from './user.model';

export type RecipeStatus = 'published' | 'draft';

export interface Recipe {
  id: string;
  authorId: string;
  title: string;
  description: string;
  /** Texto dos ingredientes (formato livre). */
  ingredients?: string | null;
  /** Modo de preparo / passo a passo (formato livre). */
  preparationSteps?: string | null;
  mediaUrls: string[];
  videoUrl?: string | null;
  categories: string[];
  tags: string[];
  isVariation: boolean;
  parentRecipeId?: string | null;
  ratingAvg: number;
  ratingsCount: number;
  popularityScore?: number;
  status?: RecipeStatus;
  createdAt: Date;
  author?: User;
}
