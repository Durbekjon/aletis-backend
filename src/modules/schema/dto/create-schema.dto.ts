import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateSchemaDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
