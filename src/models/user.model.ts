export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl?: string | null;
  followersCount: number;
  followingCount: number;
  popularityScore: number;
  /** IDs das receitas favoritadas pelo usuário */
  favoriteRecipeIds?: string[];
  createdAt: Date;
  isAdsFree?: boolean;
  deletedAt?: Date | null;
}

export interface UserProfile extends User {}
