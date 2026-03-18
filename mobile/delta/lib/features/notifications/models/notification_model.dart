class NotificationModel {
  final String id;
  final String userId;
  final String type; // 'POST_LIKE', 'POST_COMMENT', 'JOB_APPLICATION', 'EVENT_RSVP', 'SYSTEM'
  final String title;
  final String message;
  final String? relatedId; // ID of the referenced post, job, or event
  final bool isRead;
  final DateTime createdAt;

  NotificationModel({
    required this.id,
    required this.userId,
    required this.type,
    required this.title,
    required this.message,
    this.relatedId,
    this.isRead = false,
    required this.createdAt,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    return NotificationModel(
      id: json['_id'] ?? json['id'] ?? '',
      userId: json['userId'] ?? '',
      type: json['type'] ?? 'SYSTEM',
      title: json['title'] ?? 'Notification',
      message: json['message'] ?? '',
      relatedId: json['relatedId'],
      isRead: json['isRead'] ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
    );
  }
}
