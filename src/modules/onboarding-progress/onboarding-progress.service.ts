import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { MemberRole, OnboardingProgress, OnboardingStatus, OnboardingStep } from '@prisma/client';
import { CurrentStepResponseDto, OnboardingProgressResponseDto, OnboardingStepsResponseDto } from './dto';

@Injectable()
export class OnboardingProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentStep(userId: number): Promise<CurrentStepResponseDto> {
    const organization = await this.prisma.member.findUnique({
      where: { userId, role: MemberRole.ADMIN },
      select: { organizationId: true },
    });
    if (!organization)
      throw new NotFoundException('User is not a member of any organization');
    const onboardingProgress = await this.prisma.onboardingProgress.findUnique({
      where: { organizationId: organization.organizationId },
    });
    if (!onboardingProgress)
      throw new NotFoundException('Onboarding progress not found');
    return { step: onboardingProgress.nextStep };
  }

  getOnboardingSteps(): OnboardingStepsResponseDto {
    const steps = [
      OnboardingStep.SELECT_CATEGORY,
      OnboardingStep.CONFIGURE_SCHEMA,
      OnboardingStep.ADD_FIRST_PRODUCT,
      OnboardingStep.CONNECT_BOT,
    ];
    return { steps };
  }

  async getProgress(userId: number): Promise<OnboardingProgressResponseDto> {
    const organization = await this.prisma.member.findUnique({
      where: { userId, role: MemberRole.ADMIN },
      select: { organizationId: true },
    });
    if (!organization)
      throw new NotFoundException('User is not a member of any organization');
    const onboardingProgress = await this.prisma.onboardingProgress.findUnique({
      where: { organizationId: organization.organizationId },
    });
    if (!onboardingProgress)
      throw new NotFoundException('Onboarding progress not found');
    return onboardingProgress;
  }

  async handleNextStep(
    userId: number,
    step: OnboardingStep,
  ): Promise<OnboardingProgressResponseDto> {
    const organization = await this.prisma.member.findUnique({
      where: { userId, role: MemberRole.ADMIN },
      select: { organizationId: true },
    });
    if (!organization)
      throw new NotFoundException('User is not a member of any organization');
    const percentage =
      step === OnboardingStep.SELECT_CATEGORY
        ? 40
        : step === OnboardingStep.CONFIGURE_SCHEMA
          ? 60
          : step === OnboardingStep.ADD_FIRST_PRODUCT
            ? 80
            : step === OnboardingStep.CONNECT_BOT
              ? 100
              : 0;
    let status: OnboardingStatus = OnboardingStatus.INCOMPLETE;
    if (percentage === 100) status = OnboardingStatus.COMPLETED;
    return this.prisma.onboardingProgress.update({
      where: { organizationId: organization.organizationId },
      data: { nextStep: step, percentage, status },
    });
  }
}
