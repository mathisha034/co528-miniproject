import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey:
                (process.env.KEYCLOAK_PUBLIC_KEY || '').replace(/\\n/g, '\n') ||
                'dev-secret-change-in-production',
            algorithms: process.env.KEYCLOAK_PUBLIC_KEY ? ['RS256'] : ['HS256'],
        });
    }

    async validate(payload: any) {
        return {
            sub: payload.sub,
            email: payload.email,
            name: payload.name,
            role:
                payload.realm_access?.roles?.find((r: string) =>
                    ['student', 'alumni', 'admin'].includes(r),
                ) || 'student',
        };
    }
}
