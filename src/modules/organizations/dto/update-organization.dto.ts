import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

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

  @ApiPropertyOptional({
    example: 1,
    description: 'File ID of the organization logo',
    nullable: true,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  logoId?: number | null;
}
