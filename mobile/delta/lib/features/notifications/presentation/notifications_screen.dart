import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../providers/notification_provider.dart';
import '../models/notification_model.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(notificationProvider.notifier).fetchNotifications();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final notificationState = ref.watch(notificationProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: notificationState.unreadCount > 0
                ? () {
                    ref.read(notificationProvider.notifier).markAllAsRead();
                  }
                : null,
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(notificationProvider.notifier).fetchNotifications(),
        child: notificationState.isLoading
            ? const Center(child: CircularProgressIndicator())
            : notificationState.error != null
                ? Center(child: Text('Error: ${notificationState.error}'))
                : notificationState.notifications.isEmpty
                    ? const Center(child: Text('You have no notifications.'))
                    : ListView.separated(
                        itemCount: notificationState.notifications.length,
                        separatorBuilder: (context, index) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final notification = notificationState.notifications[index];
                          return _buildNotificationTile(theme, notification, ref);
                        },
                      ),
      ),
    );
  }

  Widget _buildNotificationTile(ThemeData theme, NotificationModel notification, WidgetRef ref) {
    IconData getIconForType() {
      switch (notification.type) {
        case 'POST_LIKE':
          return Icons.thumb_up_alt_outlined;
        case 'POST_COMMENT':
          return Icons.comment_outlined;
        case 'JOB_APPLICATION':
          return Icons.work_outline;
        case 'EVENT_RSVP':
          return Icons.event_available_outlined;
        default:
          return Icons.notifications_none;
      }
    }

    Color getColorForType() {
      switch (notification.type) {
        case 'POST_LIKE':
          return Colors.blue;
        case 'POST_COMMENT':
          return Colors.green;
        case 'JOB_APPLICATION':
          return Colors.purple;
        case 'EVENT_RSVP':
          return Colors.orange;
        default:
          return Colors.grey;
      }
    }

    return InkWell(
      onTap: () {
        if (!notification.isRead) {
          ref.read(notificationProvider.notifier).markAsRead(notification.id);
        }
        // TODO: Navigate to the actual item (Post, Job, or Event) if necessary
      },
      child: Container(
        color: notification.isRead ? Colors.transparent : theme.colorScheme.primary.withOpacity(0.05),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              backgroundColor: getColorForType().withOpacity(0.1),
              child: Icon(getIconForType(), color: getColorForType()),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RichText(
                    text: TextSpan(
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: Colors.black87,
                        fontWeight: notification.isRead ? FontWeight.normal : FontWeight.w600,
                      ),
                      children: [
                        TextSpan(
                          text: '${notification.title}: ',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        TextSpan(text: notification.message),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    timeago.format(notification.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
            if (!notification.isRead)
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary,
                  shape: BoxShape.circle,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
