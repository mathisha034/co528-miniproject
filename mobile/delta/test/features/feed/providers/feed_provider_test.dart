import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:delta/features/feed/models/post_model.dart';
import 'package:delta/features/feed/providers/feed_provider.dart';
import 'package:delta/features/feed/repositories/feed_repository.dart';

class MockFeedRepository extends Mock implements FeedRepository {}

void main() {
  late MockFeedRepository mockRepository;
  late FeedNotifier notifier;

  final testPost1 = Post(
    id: 'post_1',
    content: 'Hello World',
    createdAt: DateTime.now(),
    authorId: 'author_1',
    author: Author(id: 'author_1', username: 'john_doe', email: 'john@example.com', roles: ['student']),
    likesCount: 5,
    isLikedByMe: false,
  );

  final testPost2 = Post(
    id: 'post_2',
    content: 'Test Post 2',
    createdAt: DateTime.now(),
    authorId: 'author_2',
    author: Author(id: 'author_2', username: 'jane_smith', email: 'jane@example.com', roles: ['alumni']),
    likesCount: 10,
    isLikedByMe: true,
  );

  setUp(() {
    mockRepository = MockFeedRepository();
    // Prevent fetchInitialFeed from crashing immediately in constructor before we can test it
    when(() => mockRepository.fetchFeed(page: any(named: 'page'), limit: any(named: 'limit'), filter: any(named: 'filter')))
        .thenAnswer((_) async => <Post>[]);
    
    final container = ProviderContainer(
      overrides: [
        feedRepositoryProvider.overrideWithValue(mockRepository),
      ],
    );
    notifier = container.read(feedProvider.notifier);
  });

  group('FeedNotifier', () {
    test('fetchInitialFeed populates posts and clears error', () async {
      // Arrange
      when(() => mockRepository.fetchFeed(page: 1, limit: 10, filter: 'All'))
          .thenAnswer((_) async => [testPost1, testPost2]);

      // Act
      await notifier.fetchInitialFeed();

      // Assert
      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.posts.length, 2);
      expect(notifier.state.posts[0].id, 'post_1');
      expect(notifier.state.error, isNull);
      expect(notifier.state.hasReachedMax, isTrue); // < 10 items returned
    });

    test('toggleLike optimistically updates UI', () async {
      // Setup initial state
      when(() => mockRepository.fetchFeed(page: 1, limit: 10, filter: 'All'))
          .thenAnswer((_) async => [testPost1]);
      await notifier.fetchInitialFeed();
      
      when(() => mockRepository.likePost('post_1')).thenAnswer((_) async {});

      // Act
      await notifier.toggleLike('post_1');

      // Assert
      final updatedPost = notifier.state.posts.first;
      expect(updatedPost.likesCount, 6); // 5 + 1
      expect(updatedPost.isLikedByMe, isTrue); // false -> true
      verify(() => mockRepository.likePost('post_1')).called(1);
    });

    test('addPost adds new post to the top of the list', () async {
      // Setup initial state
      when(() => mockRepository.fetchFeed(page: 1, limit: 10, filter: 'All'))
          .thenAnswer((_) async => [testPost1]);
      await notifier.fetchInitialFeed();

      final newPost = Post(
        id: 'new_post',
        content: 'New content',
        createdAt: DateTime.now(),
        authorId: 'author_1',
        author: Author(id: 'author_1', username: 'john_doe', email: 'john@example.com', roles: ['student']),
        likesCount: 0,
        isLikedByMe: false,
      );

      when(() => mockRepository.createPost('New content', imagePath: null))
          .thenAnswer((_) async => newPost);

      // Act
      await notifier.addPost('New content');

      // Assert
      expect(notifier.state.posts.length, 2);
      expect(notifier.state.posts.first.id, 'new_post'); // Inserted at top
    });
  });
}
