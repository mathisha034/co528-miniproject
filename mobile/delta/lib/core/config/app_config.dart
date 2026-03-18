import 'dart:developer' as developer;

import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AppEnvironment {
  emulator,
  // USB-only debug mode used with `adb reverse`.
  // Keep this separate so it can be removed cleanly when robust device mode is the only path.
  usb,
  device,
  release,
}

final appConfigProvider = Provider<AppConfig>((ref) {
  final config = AppConfig.fromEnvironment();
  _logResolvedConfig(config, source: 'dart-define');
  return config;
});

class AppConfigException implements Exception {
  final List<String> errors;

  AppConfigException(this.errors);

  @override
  String toString() => 'AppConfigException: ${errors.join('; ')}';
}

class AppConfig {
  final String apiBaseUrl;
  final String oidcDiscoveryUrl;
  final String oidcClientId;
  final String oidcRedirectUri;
  final AppEnvironment appEnvironment;

  const AppConfig._({
    required this.apiBaseUrl,
    required this.oidcDiscoveryUrl,
    required this.oidcClientId,
    required this.oidcRedirectUri,
    required this.appEnvironment,
  });

  factory AppConfig.unsafe({
    required String apiBaseUrl,
    required String oidcDiscoveryUrl,
    required String oidcClientId,
    required String oidcRedirectUri,
    required AppEnvironment appEnvironment,
  }) {
    return AppConfig._(
      apiBaseUrl: apiBaseUrl,
      oidcDiscoveryUrl: oidcDiscoveryUrl,
      oidcClientId: oidcClientId,
      oidcRedirectUri: oidcRedirectUri,
      appEnvironment: appEnvironment,
    );
  }

  factory AppConfig.fromEnvironment() {
    return AppConfig._(
      apiBaseUrl: const String.fromEnvironment('API_BASE_URL', defaultValue: ''),
      oidcDiscoveryUrl: const String.fromEnvironment(
        'OIDC_DISCOVERY_URL',
        defaultValue: '',
      ),
      oidcClientId: const String.fromEnvironment('OIDC_CLIENT_ID', defaultValue: ''),
      oidcRedirectUri: const String.fromEnvironment(
        'OIDC_REDIRECT_URI',
        defaultValue: '',
      ),
      appEnvironment: _parseEnvironment(
        // Defaults to device for safety. USB/emulator/device/release should still be
        // explicitly set in run profiles to avoid ambiguous behavior.
        const String.fromEnvironment('APP_ENV', defaultValue: 'device'),
      ),
    ).validated();
  }

  factory AppConfig.fromMap(Map<String, String> env) {
    return AppConfig._(
      apiBaseUrl: env['API_BASE_URL'] ?? '',
      oidcDiscoveryUrl: env['OIDC_DISCOVERY_URL'] ?? '',
      oidcClientId: env['OIDC_CLIENT_ID'] ?? '',
      oidcRedirectUri: env['OIDC_REDIRECT_URI'] ?? '',
      appEnvironment: _parseEnvironment(env['APP_ENV'] ?? ''),
    ).validated();
  }

  bool get requiresHttps =>
      appEnvironment == AppEnvironment.device ||
      appEnvironment == AppEnvironment.release;

  AppConfig validated() {
    final errors = <String>[];

    if (apiBaseUrl.trim().isEmpty) {
      errors.add('API_BASE_URL is required.');
    }
    if (oidcDiscoveryUrl.trim().isEmpty) {
      errors.add('OIDC_DISCOVERY_URL is required.');
    }
    if (oidcClientId.trim().isEmpty) {
      errors.add('OIDC_CLIENT_ID is required.');
    }
    if (oidcRedirectUri.trim().isEmpty) {
      errors.add('OIDC_REDIRECT_URI is required.');
    }

    final apiUri = Uri.tryParse(apiBaseUrl);
    if (apiBaseUrl.trim().isNotEmpty && !_isValidAbsoluteUri(apiUri)) {
      errors.add('API_BASE_URL must be a valid absolute URL.');
    }

    final discoveryUri = Uri.tryParse(oidcDiscoveryUrl);
    if (oidcDiscoveryUrl.trim().isNotEmpty && !_isValidAbsoluteUri(discoveryUri)) {
      errors.add('OIDC_DISCOVERY_URL must be a valid absolute URL.');
    }

    final redirectUri = Uri.tryParse(oidcRedirectUri);
    if (oidcRedirectUri.trim().isNotEmpty && !_isValidUri(redirectUri)) {
      errors.add('OIDC_REDIRECT_URI must be a valid URI.');
    }

    if (requiresHttps) {
      if ((apiUri?.scheme.toLowerCase() ?? '') != 'https') {
        errors.add(
          'API_BASE_URL must use https for APP_ENV=device or APP_ENV=release.',
        );
      }

      if ((discoveryUri?.scheme.toLowerCase() ?? '') != 'https') {
        errors.add(
          'OIDC_DISCOVERY_URL must use https for APP_ENV=device or APP_ENV=release.',
        );
      }
    }

    if (errors.isNotEmpty) {
      throw AppConfigException(errors);
    }

    return this;
  }

  static AppEnvironment _parseEnvironment(String value) {
    switch (value.trim().toLowerCase()) {
      case 'emulator':
        return AppEnvironment.emulator;
      case 'usb':
        return AppEnvironment.usb;
      case 'device':
        return AppEnvironment.device;
      case 'release':
        return AppEnvironment.release;
      default:
        throw AppConfigException([
          'APP_ENV is required and must be one of: emulator, usb, device, release.',
        ]);
    }
  }

  static bool _isValidAbsoluteUri(Uri? uri) {
    return _isValidUri(uri) && uri!.hasAuthority;
  }

  static bool _isValidUri(Uri? uri) {
    return uri != null && uri.hasScheme;
  }
}

void _logResolvedConfig(AppConfig config, {required String source}) {
  final api = Uri.tryParse(config.apiBaseUrl);
  final discovery = Uri.tryParse(config.oidcDiscoveryUrl);

  developer.log(
    'Resolved AppConfig from $source: env=${config.appEnvironment.name}, '
    'requiresHttps=${config.requiresHttps}, '
    'api=${api?.scheme ?? 'invalid'}://${api?.host ?? 'invalid'}:${api?.port ?? ''}, '
    'oidc=${discovery?.scheme ?? 'invalid'}://${discovery?.host ?? 'invalid'}:${discovery?.port ?? ''}',
    name: 'delta.app_config',
  );
}
