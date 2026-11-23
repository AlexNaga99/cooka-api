export interface UserPreferences {
  categoryIds?: string[];
  cookingLevel?: 'beginner' | 'intermediate' | 'advanced';
  cookingTime?: 'quick' | 'medium' | 'relaxed';
  goal?: 'discover' | 'save' | 'publish' | 'both';
  /** Quando o usuário respondeu o onboarding de personalização. */
  completedAt?: Date;
}

export interface User {
  id: string;
  name: string;
  /** Nome normalizado em lower-case para buscas por prefixo no Firestore. */
  nameLower?: string;
  email: string;
  photoUrl?: string | null;
  followersCount: number;
  followingCount: number;
  popularityScore: number;
  /** Contador desnormalizado de receitas publicadas — evita full scan em /users/cooks. */
  recipesCount?: number;
  /** IDs das receitas favoritadas pelo usuário */
  favoriteRecipeIds?: string[];
  createdAt: Date;
  isAdsFree?: boolean;
  /** Respostas do onboarding (só devolvidas ao próprio usuário). */
  preferences?: UserPreferences;
  deletedAt?: Date | null;
}

export interface UserProfile extends User {}
