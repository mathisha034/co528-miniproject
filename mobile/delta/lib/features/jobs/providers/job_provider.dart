import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/job_model.dart';
import '../repositories/job_repository.dart';

class JobState {
  final List<Job> jobs;
  final bool isLoading;
  final String? error;
  final String filter; // 'All', 'Full-time', 'Internship', 'Contract'

  JobState({
    this.jobs = const [],
    this.isLoading = true,
    this.error,
    this.filter = 'All',
  });

  JobState copyWith({
    List<Job>? jobs,
    bool? isLoading,
    String? error,
    String? filter,
  }) {
    return JobState(
      jobs: jobs ?? this.jobs,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      filter: filter ?? this.filter,
    );
  }
}

class JobNotifier extends Notifier<JobState> {
  late JobRepository _repository;

  @override
  JobState build() {
    _repository = ref.watch(jobRepositoryProvider);
    return JobState();
  }

  Future<void> fetchJobs({String? filter}) async {
    final activeFilter = filter ?? state.filter;
    state = state.copyWith(isLoading: true, error: null, filter: activeFilter);

    try {
      final fetchedJobs = await _repository.fetchJobs(
        status: 'OPEN', 
        type: activeFilter == 'All' ? null : activeFilter,
      );
      state = state.copyWith(jobs: fetchedJobs, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> applyForJob(String jobId) async {
    try {
      await _repository.applyForJob(jobId);
      // Optimistically update applicationsCount
      final jobIndex = state.jobs.indexWhere((j) => j.id == jobId);
      if (jobIndex != -1) {
        final job = state.jobs[jobIndex];
        final updatedJob = Job(
          id: job.id,
          title: job.title,
          description: job.description,
          company: job.company,
          location: job.location,
          employmentType: job.employmentType,
          requirements: job.requirements,
          tags: job.tags,
          deadline: job.deadline,
          status: job.status,
          authorId: job.authorId,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          applicationsCount: job.applicationsCount + 1,
        );
        final newJobs = [...state.jobs];
        newJobs[jobIndex] = updatedJob;
        state = state.copyWith(jobs: newJobs);
      }
    } catch (e) {
      throw Exception('Failed to submit application: $e');
    }
  }
}

final jobProvider = NotifierProvider<JobNotifier, JobState>(() {
  return JobNotifier();
});
