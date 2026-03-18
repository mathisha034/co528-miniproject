import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../models/research_model.dart';

final researchRepositoryProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return ResearchRepository(dio);
});

class ResearchRepository {
  final Dio _dio;

  ResearchRepository(this._dio);

  Future<List<ResearchProject>> fetchProjects() async {
    try {
      final response = await _dio.get('/research-service/research');
      if (response.statusCode == 200) {
        final data = response.data['data'] as List;
        return data.map((json) => ResearchProject.fromJson(json)).toList();
      }
      throw Exception('Failed to load research projects');
    } catch (e) {
      throw Exception('Error fetching projects: $e');
    }
  }

  // File uploads will be mocked for demo if no direct MinIO connectivity exists
  Future<void> createProject(String title, String description, List<String> tags) async {
    try {
      await _dio.post('/research-service/research', data: {
        'title': title,
        'description': description,
        'tags': tags,
      });
    } catch (e) {
      throw Exception('Failed to create project: $e');
    }
  }
}
