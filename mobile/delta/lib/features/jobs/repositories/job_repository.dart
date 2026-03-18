import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../models/job_model.dart';

final jobRepositoryProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return JobRepository(dio);
});

class JobRepository {
  final Dio _dio;

  JobRepository(this._dio);

  Future<List<Job>> fetchJobs({String? status, String? type}) async {
    try {
      final queryParams = <String, dynamic>{};
      if (status != null) queryParams['status'] = status.toUpperCase();
      if (type != null && type != 'All') queryParams['type'] = type;

      final response = await _dio.get('/job-service/jobs', queryParameters: queryParams);
      
      if (response.statusCode == 200) {
        final data = response.data['data'] as List;
        return data.map((json) => Job.fromJson(json)).toList();
      }
      throw Exception('Failed to load jobs');
    } catch (e) {
      throw Exception('Error fetching jobs: $e');
    }
  }

  Future<void> applyForJob(String jobId) async {
    try {
      await _dio.post('/job-service/jobs/$jobId/apply');
    } catch (e) {
      throw Exception('Failed to apply for job: $e');
    }
  }
}
