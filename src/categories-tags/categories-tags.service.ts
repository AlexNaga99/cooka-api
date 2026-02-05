import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getFirestoreDb } from '../config/firebase.config';
import type { CategoryTagItemDto } from './dto/category-tag.dto';

const COLLECTION_CATEGORIES = 'categories';
const COLLECTION_TAGS = 'tags';

@Injectable()
export class CategoriesTagsService implements OnModuleInit {
  private get db() {
    return getFirestoreDb();
  }

  private getDataPath(filename: string): string {
    const fromCwd = join(process.cwd(), 'src', 'data', filename);
    try {
      readFileSync(fromCwd, 'utf-8');
      return fromCwd;
    } catch {
      return join(__dirname, '..', 'data', filename);
    }
  }

  async onModuleInit(): Promise<void> {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty(): Promise<void> {
    const categoriesSnap = await this.db.collection(COLLECTION_CATEGORIES).limit(1).get();
    if (categoriesSnap.empty) {
      await this.seedCategories();
    }

    const tagsSnap = await this.db.collection(COLLECTION_TAGS).limit(1).get();
    if (tagsSnap.empty) {
      await this.seedTags();
    }
  }

  private async seedCategories(): Promise<void> {
    const path = this.getDataPath('categories.json');
    const content = readFileSync(path, 'utf-8');
    const items = JSON.parse(content) as CategoryTagItemDto[];
    const batch = this.db.batch();
    for (const item of items) {
      const ref = this.db.collection(COLLECTION_CATEGORIES).doc(item.id);
      batch.set(ref, item);
    }
    await batch.commit();
  }

  private async seedTags(): Promise<void> {
    const path = this.getDataPath('tags.json');
    const content = readFileSync(path, 'utf-8');
    const items = JSON.parse(content) as CategoryTagItemDto[];
    const batch = this.db.batch();
    for (const item of items) {
      const ref = this.db.collection(COLLECTION_TAGS).doc(item.id);
      batch.set(ref, item);
    }
    await batch.commit();
  }

  async getCategories(): Promise<CategoryTagItemDto[]> {
    const snapshot = await this.db.collection(COLLECTION_CATEGORIES).get();
    const items = snapshot.docs.map((d) => d.data() as CategoryTagItemDto);
    return items.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
  }

  async getTags(): Promise<CategoryTagItemDto[]> {
    const snapshot = await this.db.collection(COLLECTION_TAGS).get();
    const items = snapshot.docs.map((d) => d.data() as CategoryTagItemDto);
    return items.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
  }
}
