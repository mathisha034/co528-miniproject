import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../models/analytics_model.dart';

final analyticsRepositoryProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return AnalyticsRepository(dio);
});

class AnalyticsRepository {
  final Dio _dio;

  AnalyticsRepository(this._dio);

  Future<AnalyticsOverview> fetchOverview() async {
    try {
      final response = await _dio.get('/analytics-service/analytics/overview');
      if (response.statusCode == 200) {
        return AnalyticsOverview.fromJson(response.data['data']);
      }
      throw Exception('Failed to load analytics overview');
    } catch (e) {
      throw Exception('Error fetching overview: $e');
    }
  }

  Future<List<DailyUserRegistration>> fetchUserRegistrations() async {
    try {
      final response = await _dio.get('/analytics-service/analytics/users');
      if (response.statusCode == 200) {
        final data = response.data['data']['dailyRegistrations'] as List;
        return data.map((json) => DailyUserRegistration.fromJson(json)).toList();
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  Future<List<ServiceMetric>> fetchServiceLatencies() async {
    try {
      final response = await _dio.get('/analytics-service/analytics/latencies');
      if (response.statusCode == 200) {
        final data = response.data['data'] as List;
        return data.map((json) => ServiceMetric.fromJson(json)).toList();
      }
      return [];
    } catch (e) {
      return [];
    }
  }
}
