import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:delta/features/jobs/models/job_model.dart';
import 'package:delta/features/jobs/providers/job_provider.dart';
import 'package:delta/features/jobs/repositories/job_repository.dart';

class MockJobRepository extends Mock implements JobRepository {}

void main() {
  late MockJobRepository mockRepository;
  late JobNotifier notifier;

  final testJob = Job(
    id: 'job_1',
    title: 'Software Engineer Intern',
    description: 'Work on cutting-edge features.',
    company: 'TechCorp',
    location: 'Remote',
    employmentType: 'Internship',
    requirements: 'Dart, Flutter',
    tags: ['Mobile'],
    deadline: DateTime.now().add(const Duration(days: 14)),
    status: 'OPEN',
    authorId: 'admin_1',
    createdAt: DateTime.now(),
    updatedAt: DateTime.now(),
    applicationsCount: 5,
  );

  setUp(() {
    mockRepository = MockJobRepository();
    // Default mock response to prevent unexpected crashes
    when(() => mockRepository.fetchJobs(status: any(named: 'status'), type: any(named: 'type')))
        .thenAnswer((_) async => <Job>[]);

    final container = ProviderContainer(
      overrides: [
        jobRepositoryProvider.overrideWithValue(mockRepository),
      ],
    );
    notifier = container.read(jobProvider.notifier);
  });

  group('JobNotifier', () {
    test('fetchJobs populates the state successfully', () async {
      // Arrange
      when(() => mockRepository.fetchJobs(status: 'OPEN', type: null))
          .thenAnswer((_) async => [testJob]);

      // Act
      await notifier.fetchJobs();

      // Assert
      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.error, isNull);
      expect(notifier.state.jobs.length, 1);
      expect(notifier.state.jobs.first.id, 'job_1');
    });

    test('fetchJobs with filter passes correct type to repository', () async {
      // Arrange
      when(() => mockRepository.fetchJobs(status: 'OPEN', type: 'Internship'))
          .thenAnswer((_) async => [testJob]);

      // Act
      await notifier.fetchJobs(filter: 'Internship');

      // Assert
      expect(notifier.state.filter, 'Internship');
      verify(() => mockRepository.fetchJobs(status: 'OPEN', type: 'Internship')).called(1);
    });

    test('applyForJob optimistically increments applicationsCount', () async {
      // Arrange
      when(() => mockRepository.fetchJobs(status: 'OPEN', type: null))
          .thenAnswer((_) async => [testJob]);
      await notifier.fetchJobs();
      
      when(() => mockRepository.applyForJob('job_1')).thenAnswer((_) async {});

      // Act
      await notifier.applyForJob('job_1');

      // Assert
      final updatedJob = notifier.state.jobs.firstWhere((j) => j.id == 'job_1');
      expect(updatedJob.applicationsCount, 6); // 5 + 1
      verify(() => mockRepository.applyForJob('job_1')).called(1);
    });
  });
}
