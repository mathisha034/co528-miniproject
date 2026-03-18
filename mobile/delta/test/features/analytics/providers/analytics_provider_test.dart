import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:delta/features/analytics/models/analytics_model.dart';
import 'package:delta/features/analytics/providers/analytics_provider.dart';
import 'package:delta/features/analytics/repositories/analytics_repository.dart';

class MockAnalyticsRepository extends Mock implements AnalyticsRepository {}

void main() {
  late MockAnalyticsRepository mockRepository;
  late AnalyticsNotifier notifier;

  final testOverview = AnalyticsOverview(
    totalUsers: 150,
    totalPosts: 300,
    totalJobs: 25,
    totalEvents: 10,
  );

  final testRegistrations = [
    DailyUserRegistration(date: '2026-03-01', count: 12),
    DailyUserRegistration(date: '2026-03-02', count: 18),
  ];

  final testMetrics = [
    ServiceMetric(serviceName: 'user-service', latestLatencyMs: 45.2, isHealthy: true),
    ServiceMetric(serviceName: 'feed-service', latestLatencyMs: 65.8, isHealthy: true),
  ];

  setUp(() {
    mockRepository = MockAnalyticsRepository();

    when(() => mockRepository.fetchOverview())
        .thenAnswer((_) async => testOverview);
    when(() => mockRepository.fetchUserRegistrations())
        .thenAnswer((_) async => testRegistrations);
    when(() => mockRepository.fetchServiceLatencies())
        .thenAnswer((_) async => testMetrics);

    final container = ProviderContainer(
      overrides: [
        analyticsRepositoryProvider.overrideWithValue(mockRepository),
      ],
    );
    notifier = container.read(analyticsProvider.notifier);
  });

  group('AnalyticsNotifier', () {
    test('fetchAllAnalytics uses Future.wait to populate overview, chart data, and latencies', () async {
      // Act
      await notifier.fetchAllAnalytics();

      // Assert
      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.error, isNull);
      
      expect(notifier.state.overview?.totalUsers, 150);
      expect(notifier.state.overview?.totalPosts, 300);
      
      expect(notifier.state.userRegistrations.length, 2);
      expect(notifier.state.userRegistrations.first.count, 12);
      
      expect(notifier.state.serviceMetrics.length, 2);
      expect(notifier.state.serviceMetrics.first.serviceName, 'user-service');
      
      // Verify all 3 repo methods were called simultaneously
      verify(() => mockRepository.fetchOverview()).called(1);
      verify(() => mockRepository.fetchUserRegistrations()).called(1);
      verify(() => mockRepository.fetchServiceLatencies()).called(1);
    });
  });
}
