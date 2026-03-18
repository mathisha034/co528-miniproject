import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/analytics_model.dart';
import '../repositories/analytics_repository.dart';

class AnalyticsState {
  final AnalyticsOverview? overview;
  final List<DailyUserRegistration> userRegistrations;
  final List<ServiceMetric> serviceMetrics;
  final bool isLoading;
  final String? error;

  AnalyticsState({
    this.overview,
    this.userRegistrations = const [],
    this.serviceMetrics = const [],
    this.isLoading = true,
    this.error,
  });

  AnalyticsState copyWith({
    AnalyticsOverview? overview,
    List<DailyUserRegistration>? userRegistrations,
    List<ServiceMetric>? serviceMetrics,
    bool? isLoading,
    String? error,
  }) {
    return AnalyticsState(
      overview: overview ?? this.overview,
      userRegistrations: userRegistrations ?? this.userRegistrations,
      serviceMetrics: serviceMetrics ?? this.serviceMetrics,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AnalyticsNotifier extends Notifier<AnalyticsState> {
  late AnalyticsRepository _repository;

  @override
  AnalyticsState build() {
    _repository = ref.watch(analyticsRepositoryProvider);
    return AnalyticsState();
  }

  Future<void> fetchAllAnalytics() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final overviewFuture = _repository.fetchOverview();
      final usersFuture = _repository.fetchUserRegistrations();
      final metricsFuture = _repository.fetchServiceLatencies();

      final results = await Future.wait([
        overviewFuture,
        usersFuture,
        metricsFuture,
      ]);

      state = state.copyWith(
        overview: results[0] as AnalyticsOverview,
        userRegistrations: results[1] as List<DailyUserRegistration>,
        serviceMetrics: results[2] as List<ServiceMetric>,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

final analyticsProvider = NotifierProvider<AnalyticsNotifier, AnalyticsState>(() {
  return AnalyticsNotifier();
});
