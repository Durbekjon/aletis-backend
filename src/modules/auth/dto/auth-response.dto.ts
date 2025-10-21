import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class OnboardingProgressDto {
  @ApiProperty({ type: Number, example: 1 })
  id: number;

  @ApiProperty({ type: Number, example: 80 })
  percentage: number;

  @ApiProperty({ type: Boolean, example: true })
  isCategorySelected: boolean;

  @ApiProperty({ type: Boolean, example: false })
  isSchemaConfigured: boolean;

  @ApiProperty({ type: Boolean, example: false })
  isFirstProductAdded: boolean;

  @ApiProperty({ type: Boolean, example: false })
  isBotConnected: boolean;

  @ApiProperty({ type: String, example: 'select_category' })
  nextStep: string;

  @ApiProperty({ type: String, example: 'incomplete' })
  status: string;
}

class OrganizationDto {
  @ApiProperty({ type: Number, example: 42 })
  id: number;

  @ApiProperty({ type: String, example: 'Org Inc.' })
  name: string;

  @ApiPropertyOptional({ type: OnboardingProgressDto, nullable: true })
  onboardingProgress?: OnboardingProgressDto | null;
}

export class AuthResponse {
  @ApiProperty({ type: String, example: 'eyJhbGciOiJIUzI1NiIsI...' })
  accessToken: string;

  @ApiProperty({ type: String, example: 'eyJhbGciOiJIUzI1NiIsI...' })
  refreshToken: string;

  @ApiProperty({ type: Boolean, example: true })
  hasOrganization: boolean;

  @ApiPropertyOptional({ type: OrganizationDto, nullable: true })
  organization?: OrganizationDto;
}
