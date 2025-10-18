import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/auth/strategies/jwt.strategy';
import { OnboardingProgressService } from './onboarding-progress.service';
import {
  CurrentStepResponseDto,
  OnboardingStepsResponseDto,
  OnboardingProgressResponseDto,
  UpdateNextStepDto,
} from './dto';

@ApiTags('Onboarding Progress')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'onboarding-progress', version: '1' })
export class OnboardingProgressController {
  constructor(private readonly onboardingProgressService: OnboardingProgressService) {}

  @Get('current-step')
  @ApiOperation({ 
    summary: 'Get current onboarding step',
    description: 'Returns the current onboarding step for the user\'s organization'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Current step retrieved successfully',
    type: CurrentStepResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'User is not a member of any organization or onboarding progress not found'
  })
  async getCurrentStep(@CurrentUser() user: JwtPayload): Promise<CurrentStepResponseDto> {
    return this.onboardingProgressService.getCurrentStep(Number(user.userId));
  }

  @Get('steps')
  @ApiOperation({ 
    summary: 'Get all onboarding steps',
    description: 'Returns a list of all available onboarding steps in order'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Onboarding steps retrieved successfully',
    type: OnboardingStepsResponseDto
  })
  getOnboardingSteps(): OnboardingStepsResponseDto {
    return this.onboardingProgressService.getOnboardingSteps();
  }

  @Get('progress')
  @ApiOperation({ 
    summary: 'Get full onboarding progress',
    description: 'Returns the complete onboarding progress for the user\'s organization'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Onboarding progress retrieved successfully',
    type: OnboardingProgressResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'User is not a member of any organization or onboarding progress not found'
  })
  async getProgress(@CurrentUser() user: JwtPayload): Promise<OnboardingProgressResponseDto> {
    return this.onboardingProgressService.getProgress(Number(user.userId));
  }

  @Patch('next-step')
  @ApiOperation({ 
    summary: 'Update to next onboarding step',
    description: 'Updates the onboarding progress to the specified step and recalculates percentage and status'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Onboarding progress updated successfully',
    type: OnboardingProgressResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'User is not a member of any organization'
  })
  async handleNextStep(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNextStepDto
  ): Promise<OnboardingProgressResponseDto> {
    return this.onboardingProgressService.handleNextStep(Number(user.userId), dto.step);
  }
}
