import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/repositories/auth_repository.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/main/presentation/main_shell.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/feed/presentation/feed_screen.dart';
import '../../features/feed/presentation/create_post_screen.dart';
import '../../features/jobs/presentation/jobs_screen.dart';
import '../../features/events/presentation/events_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/research/presentation/research_screen.dart';
import '../../features/analytics/presentation/analytics_screen.dart';
import '../../features/infrastructure/presentation/infrastructure_screen.dart';

// Placeholder screens for tab navigation
class PlaceholderScreen extends StatelessWidget {
  final String title;
  const PlaceholderScreen(this.title, {super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text(title, style: Theme.of(context).textTheme.headlineMedium)),
    );
  }
}

const _loginRoute = '/';

String? resolveAuthRedirect({
  required bool isLoggedIn,
  required String location,
}) {
  final isLoginRoute = location == _loginRoute;
  if (!isLoggedIn && !isLoginRoute) {
    return _loginRoute;
  }

  if (isLoggedIn && isLoginRoute) {
    return '/home';
  }

  return null;
}

final goRouterProvider = Provider<GoRouter>((ref) {
  final authRepository = ref.watch(authRepositoryProvider);

  return GoRouter(
    initialLocation: _loginRoute,
    redirect: (context, state) async {
      final isLoggedIn = await authRepository.isLoggedIn();
      return resolveAuthRedirect(
        isLoggedIn: isLoggedIn,
        location: state.uri.path,
      );
    },
    routes: [
      GoRoute(
        path: _loginRoute,
        builder: (context, state) => const LoginScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) {
          return MainShell(child: child);
        },
        routes: [
          GoRoute(
            path: '/home',
            builder: (context, state) => const FeedScreen(),
          ),
          GoRoute(
            path: '/network',
            builder: (context, state) => const EventsScreen(),
          ),
          GoRoute(
            path: '/notifications',
            builder: (context, state) => const NotificationsScreen(),
          ),
          GoRoute(
            path: '/jobs',
            builder: (context, state) => const JobsScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/post',
        builder: (context, state) => const CreatePostScreen(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/research',
        builder: (context, state) => const ResearchScreen(),
      ),
      GoRoute(
        path: '/analytics',
        builder: (context, state) => const AnalyticsScreen(),
      ),
      GoRoute(
        path: '/infrastructure',
        builder: (context, state) => const InfrastructureScreen(),
      ),
    ],
  );
});
