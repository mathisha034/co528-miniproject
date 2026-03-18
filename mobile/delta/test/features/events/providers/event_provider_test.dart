import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:delta/features/events/models/event_model.dart';
import 'package:delta/features/events/providers/event_provider.dart';
import 'package:delta/features/events/repositories/event_repository.dart';

class MockEventRepository extends Mock implements EventRepository {}

void main() {
  late MockEventRepository mockRepository;
  late EventNotifier notifier;

  final testEvent = Event(
    id: 'event_1',
    title: 'Flutter Developer Meetup',
    description: 'A great networking event.',
    format: 'IN_PERSON',
    date: DateTime.now().add(const Duration(days: 5)),
    location: 'Tech Hub',
    authorId: 'admin_1',
    createdAt: DateTime.now(),
    updatedAt: DateTime.now(),
    status: 'UPCOMING',
    attendeesCount: 50,
    isAttending: false,
  );

  setUp(() {
    mockRepository = MockEventRepository();
    
    when(() => mockRepository.fetchEvents(status: any(named: 'status')))
        .thenAnswer((_) async => <Event>[]);

    final container = ProviderContainer(
      overrides: [
        eventRepositoryProvider.overrideWithValue(mockRepository),
      ],
    );
    notifier = container.read(eventProvider.notifier);
  });

  group('EventNotifier', () {
    test('fetchEvents sets loading and then populates events array', () async {
      // Arrange
      when(() => mockRepository.fetchEvents(status: 'UPCOMING'))
          .thenAnswer((_) async => [testEvent]);

      // Act
      await notifier.fetchEvents();

      // Assert
      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.error, isNull);
      expect(notifier.state.events.length, 1);
      expect(notifier.state.events.first.id, 'event_1');
    });

    test('toggleRsvp optimistically transitions isAttending and attendeesCount', () async {
      // Arrange
      when(() => mockRepository.fetchEvents(status: 'UPCOMING'))
          .thenAnswer((_) async => [testEvent]);
      await notifier.fetchEvents();
      
      when(() => mockRepository.rsvpEvent('event_1')).thenAnswer((_) async {});

      // Act
      await notifier.toggleRsvp('event_1');

      // Assert
      final updatedEvent = notifier.state.events.firstWhere((e) => e.id == 'event_1');
      expect(updatedEvent.isAttending, isTrue); // false -> true
      expect(updatedEvent.attendeesCount, 51); // 50 + 1
      verify(() => mockRepository.rsvpEvent('event_1')).called(1);
    });
  });
}
