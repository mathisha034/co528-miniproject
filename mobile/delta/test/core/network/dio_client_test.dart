import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:delta/core/config/app_config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:delta/core/network/dio_client.dart';
import 'package:delta/features/auth/repositories/auth_repository.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

void main() {
  late MockAuthRepository mockAuthRepository;
  late ProviderContainer container;

  setUp(() {
    mockAuthRepository = MockAuthRepository();
    container = ProviderContainer(
      overrides: [
        authRepositoryProvider.overrideWithValue(mockAuthRepository),
        appConfigProvider.overrideWithValue(
          AppConfig.fromMap({
            'APP_ENV': 'device',
            'API_BASE_URL': 'https://example.test/api/v1',
            'OIDC_DISCOVERY_URL':
                'https://example.test/auth/realms/miniproject/.well-known/openid-configuration',
            'OIDC_CLIENT_ID': 'mobile-client',
            'OIDC_REDIRECT_URI': 'miniproject://login-callback',
          }),
        ),
      ],
    );
  });

  tearDown(() {
    container.dispose();
  });

  group('DioClient Interceptor', () {
    test('Uses API base URL from AppConfig provider', () {
      final dio = container.read(dioProvider);

      expect(dio.options.baseUrl, 'https://example.test/api/v1');
    });

    test('Attaches Authorization header when token exists', () async {
      // Arrange
      when(() => mockAuthRepository.getValidAccessToken())
        .thenAnswer((_) async => 'mocked_jwt_token_123');

      final dio = container.read(dioProvider);

      // We'll intercept the request to check the headers right before it goes out
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            expect(options.headers['Authorization'], 'Bearer mocked_jwt_token_123');
            // Complete the request immediately to prevent actual network call
            return handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'message': 'Success'},
            ));
          },
        ),
      );

      // Act
      await dio.get('/test-endpoint');

      // Assert
      verify(() => mockAuthRepository.getValidAccessToken()).called(1);
    });

    test('Does not attach Authorization header when token is null', () async {
      // Arrange
      when(() => mockAuthRepository.getValidAccessToken())
          .thenAnswer((_) async => null);

      final dio = container.read(dioProvider);

      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            expect(options.headers.containsKey('Authorization'), isFalse);
            return handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
            ));
          },
        ),
      );

      // Act
      await dio.get('/test-endpoint');

      // Assert
      verify(() => mockAuthRepository.getValidAccessToken()).called(1);
    });

  });
}
