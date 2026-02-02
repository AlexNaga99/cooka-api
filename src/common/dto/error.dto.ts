import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty()
  statusCode: number;
  @ApiProperty()
  message: string;
  @ApiPropertyOptional({ nullable: true })
  error?: string | null;
}
