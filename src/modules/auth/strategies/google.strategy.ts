import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface GoogleProfilePayload {
  email: string;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') ?? '',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
      callbackURL: config.get('BASE_URL') + '/api/v1/auth/google/redirect',
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): GoogleProfilePayload {
    const email = profile.emails?.[0]?.value;
    const firstName = profile.name?.givenName;
    const lastName = profile.name?.familyName;
    return {
      email: email ?? '',
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
    };
  }
}
