import 'dart:developer' as developer;

import 'package:delta/core/config/app_config.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final flutterAppAuth = const FlutterAppAuth();

final authRepositoryProvider = Provider((ref) {
  final secureStorage = ref.watch(secureStorageProvider);
  final appConfig = ref.watch(appConfigProvider);
  return AuthRepository(flutterAppAuth, secureStorage, appConfig);
});

// Using the provider from dio_client.dart
// (We re-declare it here simply or import it)
final secureStorageProvider = Provider((ref) => const FlutterSecureStorage());

class AuthRepository {
  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _idTokenKey = 'id_token';
  static const _accessTokenExpiryKey = 'access_token_expires_at';

  final FlutterAppAuth _appAuth;
  final FlutterSecureStorage _secureStorage;
  final AppConfig _appConfig;
  final List<String> _scopes = ['openid', 'profile', 'email'];

  AuthRepository(this._appAuth, this._secureStorage, this._appConfig);

  Future<bool> login() async {
    final discoveryUri = Uri.tryParse(_appConfig.oidcDiscoveryUrl);
    final hasValidDiscoveryUri =
        discoveryUri != null && discoveryUri.hasScheme && discoveryUri.hasAuthority;

    if (!hasValidDiscoveryUri) {
      developer.log(
        'Login aborted: OIDC discovery URL is invalid.',
        name: 'AuthRepository',
      );
      return false;
    }

    if (_appConfig.requiresHttps && discoveryUri.scheme.toLowerCase() != 'https') {
      developer.log(
        'Login aborted: OIDC discovery URL must use https in device/release environments.',
        name: 'AuthRepository',
      );
      return false;
    }

    try {
      final AuthorizationTokenResponse result = await _appAuth.authorizeAndExchangeCode(
        AuthorizationTokenRequest(
          _appConfig.oidcClientId,
          _appConfig.oidcRedirectUri,
          discoveryUrl: _appConfig.oidcDiscoveryUrl,
          scopes: _scopes,
          // preferEphemeralSession: false, // For iOS if you want SSO
        ),
      );

      if (result.accessToken != null) {
        await _persistTokens(
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          idToken: result.idToken,
          accessTokenExpiry: result.accessTokenExpirationDateTime,
        );
        return true;
      }
    } catch (e, st) {
      developer.log(
        'Login failed during authorization exchange.',
        name: 'AuthRepository',
        error: e,
        stackTrace: st,
      );
    }
    return false;
  }

  Future<String?> getValidAccessToken() async {
    final token = await _secureStorage.read(key: _accessTokenKey);
    if (token == null || token.isEmpty) {
      return null;
    }

    final expiry = await _readAccessTokenExpiry();
    if (expiry == null || DateTime.now().isBefore(expiry.subtract(const Duration(seconds: 30)))) {
      return token;
    }

    return refreshAccessToken();
  }

  Future<String?> refreshAccessToken() async {
    final refreshToken = await _secureStorage.read(key: _refreshTokenKey);
    if (refreshToken == null || refreshToken.isEmpty) {
      developer.log(
        'Refresh skipped: no refresh token found.',
        name: 'AuthRepository',
      );
      return null;
    }

    try {
      final response = await _appAuth.token(
        TokenRequest(
          _appConfig.oidcClientId,
          _appConfig.oidcRedirectUri,
          discoveryUrl: _appConfig.oidcDiscoveryUrl,
          refreshToken: refreshToken,
          scopes: _scopes,
        ),
      );
      final newAccessToken = response.accessToken;

      if (newAccessToken == null || newAccessToken.isEmpty) {
        developer.log(
          'Refresh failed: token endpoint returned no access token.',
          name: 'AuthRepository',
        );
        return null;
      }

      await _persistTokens(
        accessToken: newAccessToken,
        refreshToken: response.refreshToken ?? refreshToken,
        idToken: response.idToken,
        accessTokenExpiry: response.accessTokenExpirationDateTime,
      );

      return newAccessToken;
    } catch (e, st) {
      developer.log(
        'Refresh failed during token exchange.',
        name: 'AuthRepository',
        error: e,
        stackTrace: st,
      );
      return null;
    }
  }

  Future<void> logout() async {
    final idToken = await _secureStorage.read(key: _idTokenKey);
    if (idToken != null) {
      try {
        await _appAuth.endSession(EndSessionRequest(
          idTokenHint: idToken,
          postLogoutRedirectUrl: _appConfig.oidcRedirectUri,
          discoveryUrl: _appConfig.oidcDiscoveryUrl,
        ));
      } catch (e, st) {
        developer.log(
          'Logout failed during end-session call.',
          name: 'AuthRepository',
          error: e,
          stackTrace: st,
        );
      }
    }
    await _secureStorage.deleteAll();
  }

  Future<bool> isLoggedIn() async {
    final token = await getValidAccessToken();
    return token != null;
  }

  Future<void> _persistTokens({
    required String? accessToken,
    required String? refreshToken,
    required String? idToken,
    required DateTime? accessTokenExpiry,
  }) async {
    await _secureStorage.write(key: _accessTokenKey, value: accessToken);
    await _secureStorage.write(key: _refreshTokenKey, value: refreshToken);
    await _secureStorage.write(key: _idTokenKey, value: idToken);

    if (accessTokenExpiry != null) {
      await _secureStorage.write(
        key: _accessTokenExpiryKey,
        value: accessTokenExpiry.toIso8601String(),
      );
    } else {
      await _secureStorage.delete(key: _accessTokenExpiryKey);
    }
  }

  Future<DateTime?> _readAccessTokenExpiry() async {
    final raw = await _secureStorage.read(key: _accessTokenExpiryKey);
    if (raw == null || raw.isEmpty) {
      return null;
    }

    return DateTime.tryParse(raw);
  }
}
