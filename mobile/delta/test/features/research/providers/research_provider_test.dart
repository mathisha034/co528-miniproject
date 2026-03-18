import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:delta/features/research/models/research_model.dart';
import 'package:delta/features/research/providers/research_provider.dart';
import 'package:delta/features/research/repositories/research_repository.dart';

class MockResearchRepository extends Mock implements ResearchRepository {}

void main() {
  late MockResearchRepository mockRepository;
  late ResearchNotifier notifier;

  final testProject = ResearchProject(
    id: 'res_1',
    title: 'AI in Healthcare',
    description: 'Analyzing medical imaging with CNNs.',
    ownerId: 'prof_1',
    collaborators: ['student_1'],
    status: 'ONGOING',
    documents: [
      ResearchDocument(
        id: 'doc_1',
        filename: 'dataset.csv',
        url: 'http://minio.local/dataset.csv',
        mimeType: 'text/csv',
        sizeBytes: 1024,
      )
    ],
    tags: ['AI', 'Health'],
    createdAt: DateTime.now(),
    updatedAt: DateTime.now(),
  );

  setUp(() {
    mockRepository = MockResearchRepository();
    
    when(() => mockRepository.fetchProjects())
        .thenAnswer((_) async => <ResearchProject>[]);

    final container = ProviderContainer(
      overrides: [
        researchRepositoryProvider.overrideWithValue(mockRepository),
      ],
    );
    notifier = container.read(researchProvider.notifier);
  });

  group('ResearchNotifier', () {
    test('fetchProjects sets loading state and populates project list', () async {
      when(() => mockRepository.fetchProjects())
          .thenAnswer((_) async => [testProject]);

      await notifier.fetchProjects();

      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.error, isNull);
      expect(notifier.state.projects.length, 1);
      expect(notifier.state.projects.first.title, 'AI in Healthcare');
      expect(notifier.state.projects.first.documents.first.filename, 'dataset.csv');
    });

    test('createProject triggers repository and refreshes state', () async {
      when(() => mockRepository.createProject('New Proj', 'Desc', ['Tag']))
          .thenAnswer((_) async {});
      when(() => mockRepository.fetchProjects())
          .thenAnswer((_) async => [testProject]);

      await notifier.createProject('New Proj', 'Desc', ['Tag']);

      verify(() => mockRepository.createProject('New Proj', 'Desc', ['Tag'])).called(1);
      verify(() => mockRepository.fetchProjects()).called(1);
    });
  });
}
