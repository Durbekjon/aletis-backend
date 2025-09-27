import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeleteFilesDto {
  @ApiProperty({
    description: 'Array of file IDs to delete',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  fileIds: number[];
}

export class DeleteFileByKeyDto {
  @ApiProperty({
    description: 'The file key/path to delete',
    example: 'public/uploads/abc123.png',
  })
  @IsString()
  key: string;
}
