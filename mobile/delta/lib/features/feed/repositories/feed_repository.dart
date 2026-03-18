import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../models/post_model.dart';

final feedRepositoryProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return FeedRepository(dio);
});

class FeedRepository {
  final Dio _dio;

  FeedRepository(this._dio);

  Future<List<Post>> fetchFeed({int page = 1, int limit = 10, String? filter}) async {
    try {
      final queryParams = {
        'page': page,
        'limit': limit,
        if (filter != null && filter != 'All') 'roles': filter.toLowerCase(),
      };

      // Assuming the Feed Service is exposed at /feed-service under api/v1
      final response = await _dio.get('/feed-service/posts', queryParameters: queryParams);
      
      if (response.statusCode == 200) {
        final data = response.data['data'] as List;
        return data.map((json) => Post.fromJson(json)).toList();
      }
      throw Exception('Failed to load feed');
    } catch (e) {
      throw Exception('Error fetching feed: $e');
    }
  }

  Future<void> likePost(String postId) async {
    try {
      await _dio.post('/feed-service/posts/$postId/like');
    } catch (e) {
      throw Exception('Failed to like post: $e');
    }
  }

  Future<Post> createPost(String content, {String? imagePath}) async {
    try {
      final formData = FormData.fromMap({
        'content': content,
        if (imagePath != null)
          'image': await MultipartFile.fromFile(imagePath),
      });

      final response = await _dio.post(
        '/feed-service/posts',
        data: formData,
        options: Options(contentType: 'multipart/form-data'),
      );

      if (response.statusCode == 201) {
        return Post.fromJson(response.data['data']);
      }
      throw Exception('Failed to create post');
    } catch (e) {
      throw Exception('Error creating post: $e');
    }
  }
}
