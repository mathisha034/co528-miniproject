import 'package:delta/core/router/app_router.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('resolveAuthRedirect', () {
    test('redirects unauthenticated user from protected route to login', () {
      final redirect = resolveAuthRedirect(
        isLoggedIn: false,
        location: '/home',
      );

      expect(redirect, '/');
    });

    test('allows unauthenticated user on login route', () {
      final redirect = resolveAuthRedirect(
        isLoggedIn: false,
        location: '/',
      );

      expect(redirect, isNull);
    });

    test('redirects authenticated user from login to home', () {
      final redirect = resolveAuthRedirect(
        isLoggedIn: true,
        location: '/',
      );

      expect(redirect, '/home');
    });

    test('allows authenticated user on protected route', () {
      final redirect = resolveAuthRedirect(
        isLoggedIn: true,
        location: '/profile',
      );

      expect(redirect, isNull);
    });
  });
}
