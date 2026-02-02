export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl?: string | null;
  followersCount: number;
  followingCount: number;
  popularityScore: number;
  createdAt: Date;
  isAdsFree?: boolean;
  deletedAt?: Date | null;
}

export interface UserProfile extends User {}
