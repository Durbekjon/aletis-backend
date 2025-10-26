import { Module } from '@nestjs/common';
import { OnboardingProgressController } from './onboarding-progress.controller';
import { OnboardingProgressService } from './onboarding-progress.service';

@Module({
  controllers: [OnboardingProgressController],
  providers: [OnboardingProgressService],
})
export class OnboardingProgressModule {}
