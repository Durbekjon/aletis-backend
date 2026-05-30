import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import {
  MemberRole,
  OnboardingProgress,
  OnboardingStatus,
  OnboardingStep,
} from '@prisma/client';
import {
  CurrentStepResponseDto,
  OnboardingProgressResponseDto,
  OnboardingStepsResponseDto,
} from './dto';

const STEP_ORDER: OnboardingStep[] = [
  OnboardingStep.ADD_FIRST_PRODUCT,
  OnboardingStep.CONNECT_BOT,
  OnboardingStep.CONNECT_CHANNEL,
];

const STEP_TO_FLAG: Record<
  OnboardingStep,
  keyof Pick<
    OnboardingProgress,
    'isFirstProductAdded' | 'isBotConnected' | 'isChannelConnected'
  >
> = {
  [OnboardingStep.ADD_FIRST_PRODUCT]: 'isFirstProductAdded',
  [OnboardingStep.CONNECT_BOT]: 'isBotConnected',
  [OnboardingStep.CONNECT_CHANNEL]: 'isChannelConnected',
};

@Injectable()
export class OnboardingProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentStep(userId: number): Promise<CurrentStepResponseDto> {
    const progress = await this.loadProgress(userId);
    return { step: progress.nextStep };
  }

  getOnboardingSteps(): OnboardingStepsResponseDto {
    return { steps: [...STEP_ORDER] };
  }

  async getProgress(userId: number): Promise<OnboardingProgressResponseDto> {
    return this.loadProgress(userId);
  }

  async getOnboardingProgress(
    userId: number,
  ): Promise<OnboardingProgress | null> {
    const organizationId = await this.requireOrganizationId(userId);
    return this.prisma.onboardingProgress.findUnique({
      where: { organizationId },
    });
  }

  async handleNextStep(
    userId: number,
    step: OnboardingStep,
  ): Promise<OnboardingProgressResponseDto> {
    const organizationId = await this.requireOrganizationId(userId);
    const flag = STEP_TO_FLAG[step];
    const updated = await this.prisma.onboardingProgress.update({
      where: { organizationId },
      data: { [flag]: true },
    });
    return this.recompute(updated);
  }

  private async loadProgress(userId: number): Promise<OnboardingProgress> {
    const organizationId = await this.requireOrganizationId(userId);
    const progress = await this.prisma.onboardingProgress.findUnique({
      where: { organizationId },
    });
    if (!progress) {
      throw new NotFoundException('Onboarding progress not found');
    }
    return progress;
  }

  private async requireOrganizationId(userId: number): Promise<number> {
    const membership = await this.prisma.member.findUnique({
      where: { userId, role: MemberRole.ADMIN },
      select: { organizationId: true },
    });
    if (!membership) {
      throw new NotFoundException('User is not a member of any organization');
    }
    return membership.organizationId;
  }

  private async recompute(
    progress: OnboardingProgress,
  ): Promise<OnboardingProgress> {
    const flags = STEP_ORDER.map((step) => progress[STEP_TO_FLAG[step]]);
    const completed = flags.filter(Boolean).length;
    const percentage = Math.round((completed / STEP_ORDER.length) * 100);
    const status =
      completed === STEP_ORDER.length
        ? OnboardingStatus.COMPLETED
        : OnboardingStatus.INCOMPLETE;
    const nextStep =
      STEP_ORDER.find((step) => !progress[STEP_TO_FLAG[step]]) ??
      STEP_ORDER[STEP_ORDER.length - 1];

    return this.prisma.onboardingProgress.update({
      where: { id: progress.id },
      data: { percentage, status, nextStep },
    });
  }
}
