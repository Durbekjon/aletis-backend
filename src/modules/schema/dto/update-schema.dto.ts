import { IsString, IsOptional } from 'class-validator';

export class UpdateSchemaDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
