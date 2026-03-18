import 'package:delta/core/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Map<String, String> validEnv({
    String appEnv = 'device',
    String apiBaseUrl = 'https://miniproject.local/api/v1',
    String oidcDiscoveryUrl =
        'https://miniproject.local/auth/realms/miniproject/.well-known/openid-configuration',
    String oidcClientId = 'mobile-client',
    String oidcRedirectUri = 'miniproject://login-callback',
  }) {
    return {
      'APP_ENV': appEnv,
      'API_BASE_URL': apiBaseUrl,
      'OIDC_DISCOVERY_URL': oidcDiscoveryUrl,
      'OIDC_CLIENT_ID': oidcClientId,
      'OIDC_REDIRECT_URI': oidcRedirectUri,
    };
  }

  group('AppConfig required keys', () {
    test('throws when APP_ENV is missing', () {
      final env = validEnv()..remove('APP_ENV');

      expect(
        () => AppConfig.fromMap(env),
        throwsA(
          isA<AppConfigException>().having(
            (e) => e.errors.first,
            'error',
            contains('APP_ENV is required'),
          ),
        ),
      );
    });

    test('throws when API_BASE_URL is missing', () {
      final env = validEnv()..remove('API_BASE_URL');

      expect(
        () => AppConfig.fromMap(env),
        throwsA(
          isA<AppConfigException>().having(
            (e) => e.errors,
            'errors',
            contains('API_BASE_URL is required.'),
          ),
        ),
      );
    });

    test('throws when OIDC_DISCOVERY_URL is missing', () {
      final env = validEnv()..remove('OIDC_DISCOVERY_URL');

      expect(
        () => AppConfig.fromMap(env),
        throwsA(
          isA<AppConfigException>().having(
            (e) => e.errors,
            'errors',
            contains('OIDC_DISCOVERY_URL is required.'),
          ),
        ),
      );
    });
  });

  group('AppConfig URL validation', () {
    test('throws when API_BASE_URL is invalid', () {
      final env = validEnv(apiBaseUrl: 'not-a-url');

      expect(
        () => AppConfig.fromMap(env),
        throwsA(
          isA<AppConfigException>().having(
            (e) => e.errors,
            'errors',
            contains('API_BASE_URL must be a valid absolute URL.'),
          ),
        ),
      );
    });

    test('throws when OIDC_DISCOVERY_URL is invalid', () {
      final env = validEnv(oidcDiscoveryUrl: 'bad-value');

      expect(
        () => AppConfig.fromMap(env),
        throwsA(
          isA<AppConfigException>().having(
            (e) => e.errors,
            'errors',
            contains('OIDC_DISCOVERY_URL must be a valid absolute URL.'),
          ),
        ),
      );
    });
  });

  group('AppConfig HTTPS policy', () {
    test('requires https in device environment', () {
      final env = validEnv(
        appEnv: 'device',
        apiBaseUrl: 'http://miniproject.local/api/v1',
      );

      expect(
        () => AppConfig.fromMap(env),
        throwsA(
          isA<AppConfigException>().having(
            (e) => e.errors,
            'errors',
            contains(
              'API_BASE_URL must use https for APP_ENV=device or APP_ENV=release.',
            ),
          ),
        ),
      );
    });

    test('requires https in release environment for discovery URL', () {
      final env = validEnv(
        appEnv: 'release',
        oidcDiscoveryUrl:
            'http://miniproject.local/auth/realms/miniproject/.well-known/openid-configuration',
      );

      expect(
        () => AppConfig.fromMap(env),
        throwsA(
          isA<AppConfigException>().having(
            (e) => e.errors,
            'errors',
            contains(
              'OIDC_DISCOVERY_URL must use https for APP_ENV=device or APP_ENV=release.',
            ),
          ),
        ),
      );
    });

    test('allows http in emulator environment', () {
      final env = validEnv(
        appEnv: 'emulator',
        apiBaseUrl: 'http://10.0.2.2:8080/api/v1',
        oidcDiscoveryUrl:
            'http://10.0.2.2:8081/realms/miniproject/.well-known/openid-configuration',
      );

      final config = AppConfig.fromMap(env);

      expect(config.appEnvironment, AppEnvironment.emulator);
      expect(config.requiresHttps, isFalse);
    });
  });
}
