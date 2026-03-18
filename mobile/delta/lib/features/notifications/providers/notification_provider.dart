import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/notification_model.dart';
import '../repositories/notification_repository.dart';

class NotificationState {
  final List<NotificationModel> notifications;
  final int unreadCount;
  final bool isLoading;
  final String? error;

  NotificationState({
    this.notifications = const [],
    this.unreadCount = 0,
    this.isLoading = true,
    this.error,
  });

  NotificationState copyWith({
    List<NotificationModel>? notifications,
    int? unreadCount,
    bool? isLoading,
    String? error,
  }) {
    return NotificationState(
      notifications: notifications ?? this.notifications,
      unreadCount: unreadCount ?? this.unreadCount,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class NotificationNotifier extends Notifier<NotificationState> {
  late NotificationRepository _repository;
  Timer? _pollingTimer;

  @override
  NotificationState build() {
    _repository = ref.watch(notificationRepositoryProvider);
    
    // Cleanup timer on dispose
    ref.onDispose(() {
      _pollingTimer?.cancel();
    });

    return NotificationState();
  }

  void startPolling() {
    // Initial fetch
    _fetchUnreadCount();
    
    // Poll every 30 seconds to match the React Web App specification
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _fetchUnreadCount();
    });
  }

  void stopPolling() {
    _pollingTimer?.cancel();
  }

  Future<void> fetchNotifications() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final notifications = await _repository.fetchNotifications(page: 1, limit: 50);
      state = state.copyWith(notifications: notifications, isLoading: false);
      await _fetchUnreadCount(); // Sync unread count
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> _fetchUnreadCount() async {
    try {
      final count = await _repository.fetchUnreadCount();
      if (count != state.unreadCount) {
        state = state.copyWith(unreadCount: count);
      }
    } catch (_) {
      // Silently ignore polling network errors
    }
  }

  Future<void> markAsRead(String notificationId) async {
    // Optimistic UI updates
    final index = state.notifications.indexWhere((n) => n.id == notificationId);
    if (index == -1 || state.notifications[index].isRead) return;

    final updatedNotifications = [...state.notifications];
    updatedNotifications[index] = NotificationModel(
      id: updatedNotifications[index].id,
      userId: updatedNotifications[index].userId,
      type: updatedNotifications[index].type,
      title: updatedNotifications[index].title,
      message: updatedNotifications[index].message,
      relatedId: updatedNotifications[index].relatedId,
      createdAt: updatedNotifications[index].createdAt,
      isRead: true, // Mark read
    );

    final newUnreadCount = state.unreadCount > 0 ? state.unreadCount - 1 : 0;
    
    state = state.copyWith(
      notifications: updatedNotifications,
      unreadCount: newUnreadCount,
    );

    // Network request
    try {
      await _repository.markAsRead(notificationId);
    } catch (_) {
      // Ignore failures
    }
  }

  Future<void> markAllAsRead() async {
    // Optimistic
    final updatedNotifications = state.notifications.map((n) {
      return NotificationModel(
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        relatedId: n.relatedId,
        createdAt: n.createdAt,
        isRead: true, // Mark all read
      );
    }).toList();

    state = state.copyWith(
      notifications: updatedNotifications,
      unreadCount: 0,
    );

    // Network request
    try {
      await _repository.markAllAsRead();
    } catch (_) {
      // Ignore failures
    }
  }
}

final notificationProvider = NotifierProvider<NotificationNotifier, NotificationState>(() {
  return NotificationNotifier();
});
