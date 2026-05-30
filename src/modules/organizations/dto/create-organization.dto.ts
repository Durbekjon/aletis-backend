import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Inc.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    example: 'We sell everything',
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string | null;
}
