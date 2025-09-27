import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSchemaDto {
  @ApiPropertyOptional({
    description: 'The name of the schema',
    example: 'Updated Product Schema',
  })
  @IsOptional()
  @IsString()
  name?: string;
}
