import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/shared/dto';
import { PostResponseDto } from './post-response.dto';

export class PostPaginatedResponseDto extends PaginatedResponseDto<PostResponseDto> {
  @ApiProperty({ type: [PostResponseDto] })
  declare items: PostResponseDto[];

  @ApiProperty({ example: 0 })
  declare total: number;

  @ApiProperty({ example: 1 })
  declare page: number;

  @ApiProperty({ example: 20 })
  declare limit: number;

  @ApiProperty({ example: 1 })
  declare totalPages: number;

  @ApiProperty({ example: false })
  declare hasNext: boolean;

  @ApiProperty({ example: false })
  declare hasPrevious: boolean;
}
