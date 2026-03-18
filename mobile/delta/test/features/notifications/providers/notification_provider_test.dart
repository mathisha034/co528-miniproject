import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:delta/features/notifications/models/notification_model.dart';
import 'package:delta/features/notifications/providers/notification_provider.dart';
import 'package:delta/features/notifications/repositories/notification_repository.dart';

class MockNotificationRepository extends Mock implements NotificationRepository {}

void main() {
  late MockNotificationRepository mockRepository;
  late NotificationNotifier notifier;

  final testNotification = NotificationModel(
    id: 'n_1',
    userId: 'admin_1',
    type: 'POST_LIKE',
    title: 'New Like',
    message: 'Someone liked your post.',
    isRead: false,
    createdAt: DateTime.now(),
  );

  setUp(() {
    mockRepository = MockNotificationRepository();

    when(() => mockRepository.fetchNotifications(page: any(named: 'page'), limit: any(named: 'limit')))
        .thenAnswer((_) async => <NotificationModel>[]);
    when(() => mockRepository.fetchUnreadCount()).thenAnswer((_) async => 0);

    final container = ProviderContainer(
      overrides: [
        notificationRepositoryProvider.overrideWithValue(mockRepository),
      ],
    );
    notifier = container.read(notificationProvider.notifier);
  });

  group('NotificationNotifier', () {
    test('fetchNotifications populates state and fetches unread count', () async {
      when(() => mockRepository.fetchNotifications(page: 1, limit: 50))
          .thenAnswer((_) async => [testNotification]);
      when(() => mockRepository.fetchUnreadCount()).thenAnswer((_) async => 1);

      await notifier.fetchNotifications();

      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.notifications.length, 1);
      expect(notifier.state.unreadCount, 1);
    });

    test('markAsRead optimistically sets isRead and decrements unreadCount', () async {
      when(() => mockRepository.fetchNotifications(page: 1, limit: 50))
          .thenAnswer((_) async => [testNotification]);
      when(() => mockRepository.fetchUnreadCount()).thenAnswer((_) async => 1);
      when(() => mockRepository.markAsRead('n_1')).thenAnswer((_) async {});

      await notifier.fetchNotifications();
      await notifier.markAsRead('n_1');

      final updatedNotification = notifier.state.notifications.firstWhere((n) => n.id == 'n_1');
      expect(updatedNotification.isRead, isTrue);
      expect(notifier.state.unreadCount, 0);
      verify(() => mockRepository.markAsRead('n_1')).called(1);
    });

    test('markAllAsRead optimistically reads all and zeroes unreadCount', () async {
      when(() => mockRepository.fetchNotifications(page: 1, limit: 50))
          .thenAnswer((_) async => [
            testNotification,
            NotificationModel(
              id: 'n_2',
              userId: 'admin_1',
              type: 'SYSTEM',
              title: 'Welcome',
              message: 'Hello',
              isRead: false,
              createdAt: DateTime.now(),
            )
          ]);
      when(() => mockRepository.fetchUnreadCount()).thenAnswer((_) async => 2);
      when(() => mockRepository.markAllAsRead()).thenAnswer((_) async {});

      await notifier.fetchNotifications();
      await notifier.markAllAsRead();

      expect(notifier.state.notifications.every((n) => n.isRead), isTrue);
      expect(notifier.state.unreadCount, 0);
      verify(() => mockRepository.markAllAsRead()).called(1);
    });
  });
}
