class Post {
  final String id;
  final String content;
  final String? imageUrl;
  final DateTime createdAt;
  final String authorId;
  final Author author;
  final int likesCount;
  final int commentsCount;
  final bool isLikedByMe;

  Post({
    required this.id,
    required this.content,
    this.imageUrl,
    required this.createdAt,
    required this.authorId,
    required this.author,
    this.likesCount = 0,
    this.commentsCount = 0,
    this.isLikedByMe = false,
  });

  factory Post.fromJson(Map<String, dynamic> json) {
    return Post(
      id: json['_id'] ?? json['id'] ?? '',
      content: json['content'] ?? '',
      imageUrl: json['imageUrl'],
      createdAt: json['createdAt'] != null 
          ? DateTime.parse(json['createdAt']) 
          : DateTime.now(),
      authorId: json['authorId'] ?? '',
      author: Author.fromJson(json['author'] ?? {}),
      likesCount: json['likesCount'] ?? 0,
      commentsCount: json['commentsCount'] ?? 0,
      isLikedByMe: json['isLikedByMe'] ?? false,
    );
  }
}

class Author {
  final String id;
  final String username;
  final String email;
  final List<String> roles;

  Author({
    required this.id,
    required this.username,
    required this.email,
    required this.roles,
  });

  factory Author.fromJson(Map<String, dynamic> json) {
    return Author(
      id: json['_id'] ?? json['id'] ?? '',
      username: json['username'] ?? 'Unknown User',
      email: json['email'] ?? '',
      roles: List<String>.from(json['roles'] ?? []),
    );
  }
}
