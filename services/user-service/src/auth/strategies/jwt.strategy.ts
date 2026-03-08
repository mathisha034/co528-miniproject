import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// Keycloak JWT payload structure
// In production this would fetch the public key from Keycloak's JWKS endpoint
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Use KEYCLOAK_PUBLIC_KEY env var; falls back to a placeholder for local dev
      secretOrKey:
        (process.env.KEYCLOAK_PUBLIC_KEY || '').replace(/\\n/g, '\n') ||
        'dev-secret-change-in-production',
      algorithms: process.env.KEYCLOAK_PUBLIC_KEY ? ['RS256'] : ['HS256'],
    });
  }

  async validate(payload: any) {
    // Keycloak does not always send `name` — it uses preferred_username,
    // given_name, and family_name instead depending on realm mapper config.
    // `email` may also be absent if the email mapper is not enabled.
    const name =
      payload.name ||
      [payload.given_name, payload.family_name].filter(Boolean).join(' ') ||
      payload.preferred_username ||
      'Unknown User';

    const email =
      payload.email ||
      payload.preferred_username ||
      `${payload.sub}@keycloak.local`;

    return {
      sub: payload.sub,
      email,
      name,
      role:
        payload.realm_access?.roles?.find((r: string) =>
          ['student', 'alumni', 'admin'].includes(r),
        ) || 'student',
    };
  }
}
