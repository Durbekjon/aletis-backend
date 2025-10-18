import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OnboardingStep, OnboardingStatus } from '@prisma/client';

export class CurrentStepResponseDto {
  @ApiProperty({ 
    description: 'Current onboarding step',
    enum: OnboardingStep,
    example: OnboardingStep.SELECT_CATEGORY
  })
  step: OnboardingStep;
}

export class OnboardingStepsResponseDto {
  @ApiProperty({ 
    description: 'List of all onboarding steps',
    type: [String],
    enum: OnboardingStep,
    example: [
      OnboardingStep.SELECT_CATEGORY,
      OnboardingStep.CONFIGURE_SCHEMA,
      OnboardingStep.ADD_FIRST_PRODUCT,
      OnboardingStep.CONNECT_BOT
    ]
  })
  steps: OnboardingStep[];
}

export class OnboardingProgressResponseDto {
  @ApiProperty({ description: 'Onboarding progress ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Organization ID', example: 1 })
  organizationId: number;

  @ApiProperty({ 
    description: 'Completion percentage',
    example: 40,
    minimum: 0,
    maximum: 100
  })
  percentage: number;

  @ApiProperty({ 
    description: 'Whether category has been selected',
    example: true
  })
  isCategorySelected: boolean;

  @ApiProperty({ 
    description: 'Whether schema has been configured',
    example: false
  })
  isSchemaConfigured: boolean;

  @ApiProperty({ 
    description: 'Whether first product has been added',
    example: false
  })
  isFirstProductAdded: boolean;

  @ApiProperty({ 
    description: 'Whether bot has been connected',
    example: false
  })
  isBotConnected: boolean;

  @ApiProperty({ 
    description: 'Next step to complete',
    enum: OnboardingStep,
    example: OnboardingStep.CONFIGURE_SCHEMA
  })
  nextStep: OnboardingStep;

  @ApiProperty({ 
    description: 'Overall onboarding status',
    enum: OnboardingStatus,
    example: OnboardingStatus.INCOMPLETE
  })
  status: OnboardingStatus;
}

export class UpdateNextStepDto {
  @ApiProperty({ 
    description: 'The step to move to',
    enum: OnboardingStep,
    example: OnboardingStep.CONFIGURE_SCHEMA
  })
  step: OnboardingStep;
}

