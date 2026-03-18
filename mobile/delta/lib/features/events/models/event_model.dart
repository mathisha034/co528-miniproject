class Event {
  final String id;
  final String title;
  final String description;
  final String format; // 'ONLINE', 'IN_PERSON', 'HYBRID'
  final DateTime date;
  final String location;
  final String authorId;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String status; // 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'
  final int attendeesCount;
  final bool isAttending;

  Event({
    required this.id,
    required this.title,
    required this.description,
    required this.format,
    required this.date,
    required this.location,
    required this.authorId,
    required this.createdAt,
    required this.updatedAt,
    required this.status,
    this.attendeesCount = 0,
    this.isAttending = false,
  });

  factory Event.fromJson(Map<String, dynamic> json) {
    return Event(
      id: json['_id'] ?? json['id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      format: json['format'] ?? 'ONLINE',
      date: json['date'] != null 
          ? DateTime.parse(json['date']) 
          : DateTime.now().add(const Duration(days: 7)),
      location: json['location'] ?? '',
      authorId: json['authorId'] ?? '',
      createdAt: json['createdAt'] != null 
          ? DateTime.parse(json['createdAt']) 
          : DateTime.now(),
      updatedAt: json['updatedAt'] != null 
          ? DateTime.parse(json['updatedAt']) 
          : DateTime.now(),
      status: json['status'] ?? 'UPCOMING',
      attendeesCount: json['attendeesCount'] ?? 0,
      isAttending: json['isAttending'] ?? false,
    );
  }
}
