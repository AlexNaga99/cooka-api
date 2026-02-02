import { Timestamp } from 'firebase-admin/firestore';

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate();
  }
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

export function toISOString(value: unknown): string {
  return toDate(value).toISOString();
}
