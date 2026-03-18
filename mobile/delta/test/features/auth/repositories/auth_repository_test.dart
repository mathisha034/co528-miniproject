import 'package:delta/core/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:delta/features/auth/repositories/auth_repository.dart';

class MockFlutterAppAuth extends Mock implements FlutterAppAuth {}
class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}
class FakeAuthorizationTokenRequest extends Fake implements AuthorizationTokenRequest {}
class FakeEndSessionRequest extends Fake implements EndSessionRequest {}
class FakeTokenRequest extends Fake implements TokenRequest {}

void main() {
  late AuthRepository authRepository;
  late MockFlutterAppAuth mockAppAuth;
  late MockFlutterSecureStorage mockSecureStorage;
  late AppConfig appConfig;

  setUpAll(() {
    registerFallbackValue(FakeAuthorizationTokenRequest());
    registerFallbackValue(FakeEndSessionRequest());
    registerFallbackValue(FakeTokenRequest());
  });

  setUp(() {
    mockAppAuth = MockFlutterAppAuth();
    mockSecureStorage = MockFlutterSecureStorage();
    appConfig = AppConfig.fromMap({
      'APP_ENV': 'device',
      'API_BASE_URL': 'https://miniproject.local/api/v1',
      'OIDC_DISCOVERY_URL':
          'https://miniproject.local/auth/realms/miniproject/.well-known/openid-configuration',
      'OIDC_CLIENT_ID': 'mobile-client',
      'OIDC_REDIRECT_URI': 'miniproject://login-callback',
    });
    authRepository = AuthRepository(mockAppAuth, mockSecureStorage, appConfig);
  });

  group('AuthRepository Login', () {
    test('Successful login saves tokens and returns true', () async {
      // Arrange
      final response = AuthorizationTokenResponse(
        'access_token_123',
        'refresh_token_456',
        DateTime.now().add(const Duration(hours: 1)),
        'id_token_789',
        'Bearer',
        null, // authorizationAdditionalParameters
        null, // tokenAdditionalParameters
        null, // scopes
      );

      when(() => mockAppAuth.authorizeAndExchangeCode(any()))
          .thenAnswer((_) async => response);
      
      when(() => mockSecureStorage.write(key: any(named: 'key'), value: any(named: 'value')))
          .thenAnswer((_) async {});
        when(() => mockSecureStorage.delete(key: any(named: 'key')))
          .thenAnswer((_) async {});

      // Act
      final result = await authRepository.login();

      // Assert
      expect(result, isTrue);
        verify(() => mockSecureStorage.write(key: 'access_token', value: 'access_token_123')).called(1);
        verify(() => mockSecureStorage.write(key: 'refresh_token', value: 'refresh_token_456')).called(1);
        verify(() => mockSecureStorage.write(key: 'id_token', value: 'id_token_789')).called(1);
        verify(() => mockSecureStorage.write(key: 'access_token_expires_at', value: any(named: 'value'))).called(1);
    });

    test('Failed login returns false when exception is thrown', () async {
      // Arrange
      when(() => mockAppAuth.authorizeAndExchangeCode(any()))
          .thenThrow(Exception('Keycloak unavailable'));

      // Act
      final result = await authRepository.login();

      // Assert
      expect(result, isFalse);
      verifyNever(() => mockSecureStorage.write(key: any(named: 'key'), value: any(named: 'value')));
    });

    test('Failed login returns false and skips AppAuth when discovery URL is invalid', () async {
      // Arrange
      final invalidDiscoveryConfig = AppConfig.unsafe(
        apiBaseUrl: 'http://10.0.2.2:8080/api/v1',
        oidcDiscoveryUrl: 'invalid-discovery-url',
        oidcClientId: 'mobile-client',
        oidcRedirectUri: 'miniproject://login-callback',
        appEnvironment: AppEnvironment.emulator,
      );
      authRepository =
          AuthRepository(mockAppAuth, mockSecureStorage, invalidDiscoveryConfig);

      // Act
      final result = await authRepository.login();

      // Assert
      expect(result, isFalse);
      verifyNever(() => mockAppAuth.authorizeAndExchangeCode(any()));
    });
  });

  group('AuthRepository Logout', () {
    test('Logout clears tokens from storage', () async {
      // Arrange
      when(() => mockSecureStorage.read(key: 'id_token'))
          .thenAnswer((_) async => 'id_token_789');
      
      // Use dynamic to avoid strict typing issues with Mocktail's any() for EndSessionRequest
      when(() => mockAppAuth.endSession(any(that: isA<EndSessionRequest>())))
          .thenAnswer((_) async => EndSessionResponse('mock_state'));
          
      when(() => mockSecureStorage.deleteAll())
          .thenAnswer((_) async {});

      // Act
      await authRepository.logout();

      // Assert
      verify(() => mockAppAuth.endSession(any(that: isA<EndSessionRequest>()))).called(1);
      verify(() => mockSecureStorage.deleteAll()).called(1);
    });
  });

  group('AuthRepository refresh', () {
    test('refreshAccessToken returns null when refresh token is missing', () async {
      when(() => mockSecureStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => null);

      final token = await authRepository.refreshAccessToken();

      expect(token, isNull);
      verifyNever(() => mockAppAuth.token(any()));
    });

    test('refreshAccessToken updates storage and returns new token', () async {
      when(() => mockSecureStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => 'refresh_token_456');
      when(() => mockSecureStorage.write(key: any(named: 'key'), value: any(named: 'value')))
          .thenAnswer((_) async {});
      when(() => mockSecureStorage.delete(key: any(named: 'key')))
          .thenAnswer((_) async {});

      final tokenResponse = TokenResponse(
        'new_access_token',
        'refresh_token_789',
        DateTime.now().add(const Duration(hours: 1)),
        'new_id_token',
        'Bearer',
        null,
        null,
      );
      when(() => mockAppAuth.token(any()))
          .thenAnswer((_) async => tokenResponse);

      final token = await authRepository.refreshAccessToken();

      expect(token, 'new_access_token');
      verify(() => mockSecureStorage.write(key: 'access_token', value: 'new_access_token')).called(1);
      verify(() => mockSecureStorage.write(key: 'refresh_token', value: 'refresh_token_789')).called(1);
    });
  });

  group('AuthRepository isLoggedIn', () {
    test('Returns true if access_token exists', () async {
      // Arrange
      when(() => mockSecureStorage.read(key: 'access_token'))
          .thenAnswer((_) async => 'access_token_123');
      when(() => mockSecureStorage.read(key: 'access_token_expires_at'))
          .thenAnswer((_) async => DateTime.now().add(const Duration(hours: 1)).toIso8601String());

      // Act
      final result = await authRepository.isLoggedIn();

      // Assert
      expect(result, isTrue);
    });

    test('Returns false if access_token is null', () async {
      // Arrange
      when(() => mockSecureStorage.read(key: 'access_token'))
          .thenAnswer((_) async => null);

      // Act
      final result = await authRepository.isLoggedIn();

      // Assert
      expect(result, isFalse);
    });

    test('Returns true when expired token is successfully refreshed', () async {
      when(() => mockSecureStorage.read(key: 'access_token'))
          .thenAnswer((_) async => 'expired_access_token');
      when(() => mockSecureStorage.read(key: 'access_token_expires_at'))
          .thenAnswer((_) async => DateTime.now().subtract(const Duration(minutes: 2)).toIso8601String());
      when(() => mockSecureStorage.read(key: 'refresh_token'))
          .thenAnswer((_) async => 'refresh_token_456');
      when(() => mockSecureStorage.write(key: any(named: 'key'), value: any(named: 'value')))
          .thenAnswer((_) async {});
      when(() => mockSecureStorage.delete(key: any(named: 'key')))
          .thenAnswer((_) async {});

      final tokenResponse = TokenResponse(
        'new_access_token',
        'refresh_token_456',
        DateTime.now().add(const Duration(hours: 1)),
        'new_id_token',
        'Bearer',
        null,
        null,
      );
      when(() => mockAppAuth.token(any()))
          .thenAnswer((_) async => tokenResponse);

      final result = await authRepository.isLoggedIn();

      expect(result, isTrue);
      verify(() => mockAppAuth.token(any())).called(1);
    });
  });
}
