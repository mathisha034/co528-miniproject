import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../models/event_model.dart';

final eventRepositoryProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return EventRepository(dio);
});

class EventRepository {
  final Dio _dio;

  EventRepository(this._dio);

  Future<List<Event>> fetchEvents({String status = 'UPCOMING'}) async {
    try {
      final response = await _dio.get(
        '/event-service/events',
        queryParameters: {'status': status},
      );
      
      if (response.statusCode == 200) {
        final data = response.data['data'] as List;
        return data.map((json) => Event.fromJson(json)).toList();
      }
      throw Exception('Failed to load events');
    } catch (e) {
      throw Exception('Error fetching events: $e');
    }
  }

  Future<void> rsvpEvent(String eventId) async {
    try {
      await _dio.post('/event-service/events/$eventId/rsvp');
    } catch (e) {
      throw Exception('Failed to RSVP: $e');
    }
  }
}
