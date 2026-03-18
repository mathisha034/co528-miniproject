class ResearchProject {
  final String id;
  final String title;
  final String description;
  final String ownerId;
  final List<String> collaborators;
  final String status; // 'ONGOING', 'COMPLETED', 'ARCHIVED'
  final List<ResearchDocument> documents;
  final List<String> tags;
  final DateTime createdAt;
  final DateTime updatedAt;

  ResearchProject({
    required this.id,
    required this.title,
    required this.description,
    required this.ownerId,
    required this.collaborators,
    required this.status,
    required this.documents,
    required this.tags,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ResearchProject.fromJson(Map<String, dynamic> json) {
    return ResearchProject(
      id: json['_id'] ?? json['id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      ownerId: json['ownerId'] ?? '',
      collaborators: List<String>.from(json['collaborators'] ?? []),
      status: json['status'] ?? 'ONGOING',
      documents: (json['documents'] as List<dynamic>?)
              ?.map((doc) => ResearchDocument.fromJson(doc))
              .toList() ??
          [],
      tags: List<String>.from(json['tags'] ?? []),
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
      updatedAt: json['updatedAt'] != null
          ? DateTime.parse(json['updatedAt'])
          : DateTime.now(),
    );
  }
}

class ResearchDocument {
  final String id;
  final String filename;
  final String url; // MinIO pre-signed or direct path
  final String mimeType;
  final int sizeBytes;

  ResearchDocument({
    required this.id,
    required this.filename,
    required this.url,
    required this.mimeType,
    required this.sizeBytes,
  });

  factory ResearchDocument.fromJson(Map<String, dynamic> json) {
    return ResearchDocument(
      id: json['_id'] ?? json['id'] ?? '',
      filename: json['filename'] ?? '',
      url: json['url'] ?? '',
      mimeType: json['mimeType'] ?? '',
      sizeBytes: json['sizeBytes'] ?? 0,
    );
  }
}
