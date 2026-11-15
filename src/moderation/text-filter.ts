import { BadRequestException } from '@nestjs/common';

/**
 * Filtro simples de texto (primeira barreira, síncrona).
 * Lista curta e editável; comparação sem acento, em minúsculas e por palavra inteira.
 * Não substitui denúncia/revisão: só barra o abuso óbvio.
 */
const BLOCKED_TERMS = [
  'porra', 'caralho', 'puta', 'putaria', 'viado', 'buceta', 'foder', 'foda-se', 'merda', 'cuzao',
  'arrombado', 'vagabunda', 'filho da puta', 'estupro', 'estuprar', 'nazista', 'pedofilia',
  'pornografia', 'sexo', 'nudes', 'xvideos', 'onlyfans',
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'faggot', 'porn', 'rape', 'nazi',
  'cocaina', 'maconha', 'crack', 'heroina', 'lsd',
];

const MAX_LINKS = 1;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\-\s]/g, ' ');
}

export function findBlockedTerm(text: string): string | null {
  const normalized = ` ${normalize(text).replace(/\s+/g, ' ')} `;
  for (const term of BLOCKED_TERMS) {
    if (normalized.includes(` ${term} `)) return term;
  }
  return null;
}

/** Lança 400 se algum texto tiver termo proibido ou links demais. */
export function assertCleanText(fields: Record<string, string | null | undefined>): void {
  for (const [label, value] of Object.entries(fields)) {
    if (!value) continue;
    if (findBlockedTerm(value)) {
      throw new BadRequestException(
        `O campo "${label}" contém linguagem imprópria. Revise o texto e tente novamente.`,
      );
    }
    const links = value.match(/https?:\/\/|www\./gi)?.length ?? 0;
    if (links > MAX_LINKS) {
      throw new BadRequestException(`O campo "${label}" contém links demais.`);
    }
  }
}
