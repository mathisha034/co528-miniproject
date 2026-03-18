class Job {
  final String id;
  final String title;
  final String description;
  final String company;
  final String location;
  final String employmentType; // e.g., 'Full-time', 'Internship', 'Contract'
  final String requirements;
  final List<String> tags;
  final DateTime deadline;
  final String status; // 'OPEN', 'CLOSED'
  final String authorId;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int applicationsCount;

  Job({
    required this.id,
    required this.title,
    required this.description,
    required this.company,
    required this.location,
    required this.employmentType,
    required this.requirements,
    required this.tags,
    required this.deadline,
    required this.status,
    required this.authorId,
    required this.createdAt,
    required this.updatedAt,
    this.applicationsCount = 0,
  });

  factory Job.fromJson(Map<String, dynamic> json) {
    return Job(
      id: json['_id'] ?? json['id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      company: json['company'] ?? '',
      location: json['location'] ?? '',
      employmentType: json['employmentType'] ?? 'Full-time',
      requirements: json['requirements'] ?? '',
      tags: List<String>.from(json['tags'] ?? []),
      deadline: json['deadline'] != null
          ? DateTime.parse(json['deadline'])
          : DateTime.now().add(const Duration(days: 30)),
      status: json['status'] ?? 'OPEN',
      authorId: json['authorId'] ?? '',
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
      updatedAt: json['updatedAt'] != null
          ? DateTime.parse(json['updatedAt'])
          : DateTime.now(),
      applicationsCount: json['applicationsCount'] ?? 0,
    );
  }
}
