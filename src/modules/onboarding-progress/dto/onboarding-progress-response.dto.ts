import { ApiProperty } from '@nestjs/swagger';
import { OnboardingStep, OnboardingStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class CurrentStepResponseDto {
  @ApiProperty({
    description: 'Current onboarding step',
    enum: OnboardingStep,
    example: OnboardingStep.ADD_FIRST_PRODUCT,
  })
  step: OnboardingStep;
}

export class OnboardingStepsResponseDto {
  @ApiProperty({
    description: 'List of all onboarding steps',
    type: [String],
    enum: OnboardingStep,
    example: [
      OnboardingStep.ADD_FIRST_PRODUCT,
      OnboardingStep.CONNECT_BOT,
      OnboardingStep.CONNECT_CHANNEL,
    ],
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
    example: 33,
    minimum: 0,
    maximum: 100,
  })
  percentage: number;

  @ApiProperty({
    description: 'Whether first product has been added',
    example: false,
  })
  isFirstProductAdded: boolean;

  @ApiProperty({
    description: 'Whether bot has been connected',
    example: false,
  })
  isBotConnected: boolean;

  @ApiProperty({
    description: 'Whether a Telegram channel has been connected',
    example: false,
  })
  isChannelConnected: boolean;

  @ApiProperty({
    description: 'Next step to complete',
    enum: OnboardingStep,
    example: OnboardingStep.CONNECT_BOT,
  })
  nextStep: OnboardingStep;

  @ApiProperty({
    description: 'Overall onboarding status',
    enum: OnboardingStatus,
    example: OnboardingStatus.INCOMPLETE,
  })
  status: OnboardingStatus;
}

export class UpdateNextStepDto {
  @ApiProperty({
    description: 'The step to mark complete',
    enum: OnboardingStep,
    example: OnboardingStep.ADD_FIRST_PRODUCT,
  })
  @IsEnum(OnboardingStep)
  @IsNotEmpty()
  step: OnboardingStep;
}
