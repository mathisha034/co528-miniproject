import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/post_model.dart';
import '../repositories/feed_repository.dart';

class FeedState {
  final List<Post> posts;
  final bool isLoading;
  final bool isFetchingMore;
  final String? error;
  final int currentPage;
  final bool hasReachedMax;
  final String filter;

  FeedState({
    this.posts = const [],
    this.isLoading = true,
    this.isFetchingMore = false,
    this.error,
    this.currentPage = 1,
    this.hasReachedMax = false,
    this.filter = 'All',
  });

  FeedState copyWith({
    List<Post>? posts,
    bool? isLoading,
    bool? isFetchingMore,
    String? error,
    int? currentPage,
    bool? hasReachedMax,
    String? filter,
  }) {
    return FeedState(
      posts: posts ?? this.posts,
      isLoading: isLoading ?? this.isLoading,
      isFetchingMore: isFetchingMore ?? this.isFetchingMore,
      error: error, // Can be null to clear error
      currentPage: currentPage ?? this.currentPage,
      hasReachedMax: hasReachedMax ?? this.hasReachedMax,
      filter: filter ?? this.filter,
    );
  }
}

class FeedNotifier extends Notifier<FeedState> {
  late FeedRepository _repository;

  @override
  FeedState build() {
    _repository = ref.watch(feedRepositoryProvider);
    return FeedState(); // Return initial state.
  }

  Future<void> fetchInitialFeed({String? filter}) async {
    final activeFilter = filter ?? state.filter;
    state = state.copyWith(isLoading: true, error: null, filter: activeFilter, currentPage: 1, hasReachedMax: false);

    try {
      final fetchedPosts = await _repository.fetchFeed(page: 1, limit: 10, filter: activeFilter);
      state = state.copyWith(
        posts: fetchedPosts,
        isLoading: false,
        hasReachedMax: fetchedPosts.length < 10,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> fetchMore() async {
    if (state.hasReachedMax || state.isFetchingMore || state.isLoading) return;

    state = state.copyWith(isFetchingMore: true, error: null);

    try {
      final nextPage = state.currentPage + 1;
      final morePosts = await _repository.fetchFeed(page: nextPage, limit: 10, filter: state.filter);
      
      state = state.copyWith(
        posts: [...state.posts, ...morePosts],
        currentPage: nextPage,
        isFetchingMore: false,
        hasReachedMax: morePosts.length < 10,
      );
    } catch (e) {
      state = state.copyWith(isFetchingMore: false, error: e.toString());
    }
  }

  Future<void> toggleLike(String postId) async {
    // Optimistic UI Update
    final postIndex = state.posts.indexWhere((p) => p.id == postId);
    if (postIndex == -1) return;

    final post = state.posts[postIndex];
    final updatedPost = Post(
      id: post.id,
      content: post.content,
      imageUrl: post.imageUrl,
      createdAt: post.createdAt,
      authorId: post.authorId,
      author: post.author,
      commentsCount: post.commentsCount,
      likesCount: post.isLikedByMe ? post.likesCount - 1 : post.likesCount + 1,
      isLikedByMe: !post.isLikedByMe,
    );

    final newPosts = [...state.posts];
    newPosts[postIndex] = updatedPost;
    state = state.copyWith(posts: newPosts);

    // Network request
    try {
      await _repository.likePost(postId);
    } catch (e) {
      // Revert on failure
      final revertedPosts = [...state.posts];
      revertedPosts[postIndex] = post;
      state = state.copyWith(posts: revertedPosts, error: 'Failed to like post');
    }
  }

  Future<void> addPost(String content, {String? imagePath}) async {
    try {
      final newPost = await _repository.createPost(content, imagePath: imagePath);
      state = state.copyWith(
        posts: [newPost, ...state.posts],
      );
    } catch (e) {
      state = state.copyWith(error: 'Failed to create post: $e');
      rethrow;
    }
  }
}

final feedProvider = NotifierProvider<FeedNotifier, FeedState>(() {
  return FeedNotifier();
});
