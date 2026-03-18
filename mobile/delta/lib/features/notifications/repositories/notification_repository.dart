import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../models/notification_model.dart';

final notificationRepositoryProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return NotificationRepository(dio);
});

class NotificationRepository {
  final Dio _dio;

  NotificationRepository(this._dio);

  Future<List<NotificationModel>> fetchNotifications({int page = 1, int limit = 20}) async {
    try {
      final response = await _dio.get(
        '/notification-service/notifications',
        queryParameters: {'page': page, 'limit': limit},
      );
      
      if (response.statusCode == 200) {
        final data = response.data['data'] as List;
        return data.map((json) => NotificationModel.fromJson(json)).toList();
      }
      throw Exception('Failed to load notifications');
    } catch (e) {
      throw Exception('Error fetching notifications: $e');
    }
  }

  Future<int> fetchUnreadCount() async {
    try {
      final response = await _dio.get('/notification-service/notifications/unread-count');
      if (response.statusCode == 200) {
        return response.data['data']['count'] ?? 0;
      }
      return 0;
    } catch (e) {
      // Fail silently for polling to prevent console spam
      return 0;
    }
  }

  Future<void> markAsRead(String notificationId) async {
    try {
      await _dio.patch('/notification-service/notifications/$notificationId/read');
    } catch (e) {
      throw Exception('Failed to mark notification as read: $e');
    }
  }

  Future<void> markAllAsRead() async {
    try {
      await _dio.patch('/notification-service/notifications/read-all');
    } catch (e) {
      throw Exception('Failed to mark all as read: $e');
    }
  }
}
