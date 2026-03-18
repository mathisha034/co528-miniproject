import 'package:dio/dio.dart';
import 'package:delta/core/config/app_config.dart';
import 'package:delta/features/auth/repositories/auth_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final dioProvider = Provider<Dio>((ref) {
  final authRepository = ref.watch(authRepositoryProvider);
  final appConfig = ref.watch(appConfigProvider);

  final parsedBaseUrl = Uri.tryParse(appConfig.apiBaseUrl);
  final hasValidBaseUrl =
      parsedBaseUrl != null && parsedBaseUrl.hasScheme && parsedBaseUrl.hasAuthority;
  if (!hasValidBaseUrl) {
    throw StateError('Invalid API_BASE_URL. Expected a valid absolute URL.');
  }

  final dio = Dio(
    BaseOptions(
      baseUrl: appConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {
        'Content-Type': 'application/json',
      },
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await authRepository.getValidAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (DioException e, handler) async {
        if (e.response?.statusCode == 401 && e.requestOptions.extra['retriedWithRefresh'] != true) {
          final refreshedToken = await authRepository.refreshAccessToken();
          if (refreshedToken != null) {
            final retryRequest = e.requestOptions;
            retryRequest.headers['Authorization'] = 'Bearer $refreshedToken';
            retryRequest.extra['retriedWithRefresh'] = true;

            try {
              final retryResponse = await dio.fetch(retryRequest);
              return handler.resolve(retryResponse);
            } on DioException catch (_) {
              // Allow the original error to pass through after retry failure.
            }
          }
        }
        return handler.next(e);
      },
    ),
  );

  return dio;
});
