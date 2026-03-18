import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/research_model.dart';
import '../repositories/research_repository.dart';

class ResearchState {
  final List<ResearchProject> projects;
  final bool isLoading;
  final String? error;

  ResearchState({
    this.projects = const [],
    this.isLoading = true,
    this.error,
  });

  ResearchState copyWith({
    List<ResearchProject>? projects,
    bool? isLoading,
    String? error,
  }) {
    return ResearchState(
      projects: projects ?? this.projects,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ResearchNotifier extends Notifier<ResearchState> {
  late ResearchRepository _repository;

  @override
  ResearchState build() {
    _repository = ref.watch(researchRepositoryProvider);
    return ResearchState();
  }

  Future<void> fetchProjects() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final projects = await _repository.fetchProjects();
      state = state.copyWith(projects: projects, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> createProject(String title, String description, List<String> tags) async {
    try {
      await _repository.createProject(title, description, tags);
      // Re-fetch instead of optimistic update since we need the generated ID
      await fetchProjects();
    } catch (e) {
      throw Exception('Failed to create research project: $e');
    }
  }
}

final researchProvider = NotifierProvider<ResearchNotifier, ResearchState>(() {
  return ResearchNotifier();
});
