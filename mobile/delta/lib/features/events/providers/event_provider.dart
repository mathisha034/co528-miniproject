import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/event_model.dart';
import '../repositories/event_repository.dart';

class EventState {
  final List<Event> events;
  final bool isLoading;
  final String? error;

  EventState({
    this.events = const [],
    this.isLoading = true,
    this.error,
  });

  EventState copyWith({
    List<Event>? events,
    bool? isLoading,
    String? error,
  }) {
    return EventState(
      events: events ?? this.events,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class EventNotifier extends Notifier<EventState> {
  late EventRepository _repository;

  @override
  EventState build() {
    _repository = ref.watch(eventRepositoryProvider);
    return EventState();
  }

  Future<void> fetchEvents() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final events = await _repository.fetchEvents(status: 'UPCOMING');
      state = state.copyWith(events: events, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> toggleRsvp(String eventId) async {
    // Optimistic UI Update
    final eventIndex = state.events.indexWhere((e) => e.id == eventId);
    if (eventIndex == -1) return;

    final event = state.events[eventIndex];
    // If we're already attending, we assume the API might not support "un-RSVP" natively 
    // or does. Let's assume toggle behavior to match the optimistic requirement, even if backend is just POST /rsvp.
    // Wait, the backend requirement for event RSVP says "POST /events/:id/rsvp". If idempotent, it sets attendance.
    
    // Optimistic prediction
    final wasAttending = event.isAttending;
    final updatedEvent = Event(
      id: event.id,
      title: event.title,
      description: event.description,
      format: event.format,
      date: event.date,
      location: event.location,
      authorId: event.authorId,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      status: event.status,
      attendeesCount: wasAttending ? event.attendeesCount - 1 : event.attendeesCount + 1,
      isAttending: !wasAttending,
    );

    final newEvents = [...state.events];
    newEvents[eventIndex] = updatedEvent;
    state = state.copyWith(events: newEvents);

    // Network Call
    try {
      await _repository.rsvpEvent(eventId);
    } catch (e) {
      // Revert optimism
      final revertedEvents = [...state.events];
      revertedEvents[eventIndex] = event;
      state = state.copyWith(events: revertedEvents, error: 'Failed to RSVP. Try again.');
    }
  }
}

final eventProvider = NotifierProvider<EventNotifier, EventState>(() {
  return EventNotifier();
});
