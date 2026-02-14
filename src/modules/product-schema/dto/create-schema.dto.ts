import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSchemaDto {
  @ApiProperty({
    description: 'The name of the schema',
    example: 'Product Schema',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}
