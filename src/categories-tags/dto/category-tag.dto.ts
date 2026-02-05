import { ApiProperty } from '@nestjs/swagger';

/**
 * Item de categoria ou tag com id estável e labels por locale (en, pt-br, etc.).
 * O front usa o id ao salvar receitas e filtrar; usa a key do locale para exibir o label.
 */
export class CategoryTagItemDto {
  @ApiProperty({ description: 'Identificador estável (slug)' })
  id: string;

  @ApiProperty({ description: 'Label em inglês', required: false })
  en?: string;

  @ApiProperty({ description: 'Label em português Brasil', required: false })
  'pt-br'?: string;

  [locale: string]: string | undefined;
}
