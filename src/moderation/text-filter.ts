import { BadRequestException } from '@nestjs/common';

/**
 * Filtro simples de texto (primeira barreira, síncrona).
 * Lista curta e editável; comparação sem acento, em minúsculas e por palavra inteira.
 * Também pega as burlas mais comuns: leetspeak (m3rda, p0rn), letras repetidas (meeerda)
 * e letras separadas (m.e.r.d.a / m e r d a).
 * Não substitui denúncia/revisão: só barra o abuso óbvio.
 */
const BLOCKED_TERMS = [
  // PT
  'porra', 'caralho', 'puta', 'putaria', 'viado', 'buceta', 'foder', 'foda-se', 'merda', 'cuzao',
  'arrombado', 'vagabunda', 'filho da puta', 'estupro', 'estuprar', 'nazista', 'pedofilia',
  'pornografia', 'porno', 'pornozao', 'sexo', 'nudes', 'nude', 'xvideos', 'xnxx', 'onlyfans', 'punheta',
  'piroca', 'xereca', 'viadinho', 'otario', 'babaca', 'desgraca', 'fdp', 'pqp', 'vsf',
  'cocaina', 'maconha', 'crack', 'heroina', 'lsd', 'ecstasy',
  // EN
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'faggot', 'porn', 'rapist', 'nazi',
  'dick', 'pussy', 'whore', 'slut', 'cum', 'blowjob', 'handjob', 'hentai', 'xxx',
];

const MAX_LINKS = 1;

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i',
};

function stripAccents(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Troca leetspeak só em palavras que misturam letras com números/símbolos ("m3rda", mas não "400g"). */
function deLeet(token: string): string {
  if (!/[a-z]/.test(token) || !/[0-9@$!]/.test(token)) return token;
  // "!" e "1" no fim de palavra são pontuação/numeração comum ("bom!", "passo 1"): só troca no meio.
  return token.replace(/[0-9@$!]/g, (c, i) => (i === token.length - 1 && /[!1]/.test(c) ? '' : LEET[c] ?? c));
}

function collapseRepeats(word: string): string {
  return word.replace(/(.)\1+/g, '$1');
}

/** Gera as variantes normalizadas do texto, cada uma como " palavras separadas por espaço ". */
function variants(text: string): string[] {
  const base = stripAccents(text);
  const tokens = base.split(/\s+/).filter(Boolean).map(deLeet);
  const clean = (s: string) => ` ${s.replace(/[^a-z0-9\-\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;

  const plain = clean(tokens.join(' '));

  // "m.e.r.d.a" / "m e r d a": junta sequências de 3+ caracteres soltos.
  const spaced = base.replace(/(?:^|[\s])((?:[a-z0-9][\s.\-_*]){2,}[a-z0-9])(?=$|[\s])/g, (m, run: string) =>
    ` ${run.replace(/[\s.\-_*]/g, '')} `,
  );
  const joined = clean(spaced.split(/\s+/).map(deLeet).join(' '));

  const collapsed = clean(plain.trim().split(' ').map(collapseRepeats).join(' '));
  const collapsedJoined = clean(joined.trim().split(' ').map(collapseRepeats).join(' '));
  return [plain, joined, collapsed, collapsedJoined];
}

const TERM_FORMS = BLOCKED_TERMS.map((t) => ({
  term: t,
  exact: ` ${t} `,
  collapsed: ` ${t.split(' ').map(collapseRepeats).join(' ')} `,
}));

export function findBlockedTerm(text: string): string | null {
  const [plain, joined, collapsed, collapsedJoined] = variants(text);
  for (const { term, exact, collapsed: c } of TERM_FORMS) {
    if (plain.includes(exact) || joined.includes(exact)) return term;
    // As formas "colapsadas" só valem quando o termo colapsado tem 4+ letras (evita falso positivo, ex.: xxx -> x).
    if (c.trim().length >= 4 && (collapsed.includes(c) || collapsedJoined.includes(c))) return term;
  }
  return null;
}

/** Chaves estáveis dos campos (o app traduz para o idioma do usuário). */
export type TextField = 'title' | 'description' | 'ingredients' | 'steps' | 'comment' | 'name' | 'bio';

const FIELD_LABEL_PT: Record<TextField, string> = {
  title: 'título',
  description: 'descrição',
  ingredients: 'ingredientes',
  steps: 'modo de preparo',
  comment: 'comentário',
  name: 'nome',
  bio: 'bio',
};

/** Lança 400 (com `code` e `field`) se algum texto tiver termo proibido ou links demais. */
export function assertCleanText(fields: Partial<Record<TextField, string | null | undefined>>): void {
  for (const [key, value] of Object.entries(fields) as Array<[TextField, string | null | undefined]>) {
    if (!value) continue;
    const label = FIELD_LABEL_PT[key];
    if (findBlockedTerm(value)) {
      throw new BadRequestException({
        message: `O campo "${label}" contém linguagem imprópria. Revise o texto e tente novamente.`,
        code: 'TEXT_BLOCKED',
        field: key,
      });
    }
    const links = value.match(/https?:\/\/|www\./gi)?.length ?? 0;
    if (links > MAX_LINKS) {
      throw new BadRequestException({
        message: `O campo "${label}" contém links demais.`,
        code: 'TEXT_TOO_MANY_LINKS',
        field: key,
      });
    }
  }
}
