class AnalyticsOverview {
  final int totalUsers;
  final int totalPosts;
  final int totalJobs;
  final int totalEvents;

  AnalyticsOverview({
    required this.totalUsers,
    required this.totalPosts,
    required this.totalJobs,
    required this.totalEvents,
  });

  factory AnalyticsOverview.fromJson(Map<String, dynamic> json) {
    return AnalyticsOverview(
      totalUsers: json['totalUsers'] ?? 0,
      totalPosts: json['totalPosts'] ?? 0,
      totalJobs: json['totalJobs'] ?? 0,
      totalEvents: json['totalEvents'] ?? 0,
    );
  }
}

class DailyUserRegistration {
  final String date;
  final int count;

  DailyUserRegistration({required this.date, required this.count});

  factory DailyUserRegistration.fromJson(Map<String, dynamic> json) {
    return DailyUserRegistration(
      date: json['date'] ?? '',
      count: json['count'] ?? 0,
    );
  }
}

class ServiceMetric {
  final String serviceName;
  final double latestLatencyMs;
  final bool isHealthy;

  ServiceMetric({
    required this.serviceName,
    required this.latestLatencyMs,
    required this.isHealthy,
  });

  factory ServiceMetric.fromJson(Map<String, dynamic> json) {
    return ServiceMetric(
      serviceName: json['serviceName'] ?? '',
      latestLatencyMs: (json['latestLatencyMs'] ?? 0).toDouble(),
      isHealthy: json['isHealthy'] ?? false,
    );
  }
}
