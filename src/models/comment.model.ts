import { User } from './user.model';

export interface Comment {
  id: string;
  recipeId: string;
  authorId: string;
  text: string;
  createdAt: Date;
  author?: User;
}
