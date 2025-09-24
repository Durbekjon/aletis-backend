import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'New Name' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description', nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string | null;
}


