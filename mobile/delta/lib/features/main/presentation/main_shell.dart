import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../notifications/providers/notification_provider.dart';

class MainShell extends ConsumerStatefulWidget {
  final Widget child;
  
  const MainShell({super.key, required this.child});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(notificationProvider.notifier).startPolling();
    });
  }

  @override
  void dispose() {
    ref.read(notificationProvider.notifier).stopPolling();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String location = GoRouterState.of(context).uri.path;
    final unreadCount = ref.watch(notificationProvider).unreadCount;

    int calculateSelectedIndex() {
      if (location.startsWith('/home')) return 0;
      if (location.startsWith('/network')) return 1;
      if (location.startsWith('/post')) return 2;
      if (location.startsWith('/notifications')) return 3;
      if (location.startsWith('/jobs')) return 4;
      return 0;
    }

    void onItemTapped(int index) {
      switch (index) {
        case 0:
          context.go('/home');
          break;
        case 1:
          context.go('/network');
          break;
        case 2:
          // Instead of navigating, we might want to push a modal here 
          // but for now let's navigate to a post creation screen
          context.push('/post');
          break;
        case 3:
          context.go('/notifications');
          break;
        case 4:
          context.go('/jobs');
          break;
      }
    }

    return Scaffold(
      appBar: location == '/' || location.startsWith('/post') 
          ? null 
          : AppBar(
              title: const Text('DECP', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 24, color: Color(0xFF0A66C2))),
              leading: IconButton(
                icon: const CircleAvatar(
                  radius: 14,
                  backgroundColor: Color(0xFFE0E0E0),
                  child: Icon(Icons.person, size: 18, color: Colors.grey),
                ),
                onPressed: () => context.push('/profile'),
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.search),
                  onPressed: () {},
                ),
                IconButton(
                  icon: const Icon(Icons.chat_bubble_outline),
                  onPressed: () {},
                ),
              ],
            ),
      body: widget.child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(
              color: Theme.of(context).dividerColor.withOpacity(0.1),
              width: 1,
            ),
          ),
        ),
        child: Theme(
          data: ThemeData(
            splashColor: Colors.transparent,
            highlightColor: Colors.transparent,
          ),
          child: NavigationBar(
            selectedIndex: calculateSelectedIndex() == 2 ? 0 : calculateSelectedIndex(), // Don't highlight create button permanently
            onDestinationSelected: onItemTapped,
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
            indicatorColor: Colors.transparent, // We want custom selection styling
            labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
            destinations: [
              const NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home_filled, color: Color(0xFF0A66C2)),
                label: 'Home',
              ),
              const NavigationDestination(
                icon: Icon(Icons.people_alt_outlined),
                selectedIcon: Icon(Icons.people_alt, color: Color(0xFF0A66C2)),
                label: 'Network',
              ),
              const NavigationDestination(
                icon: Icon(Icons.add_box_outlined, size: 28),
                selectedIcon: Icon(Icons.add_box, size: 28, color: Color(0xFF0A66C2)),
                label: 'Post',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: unreadCount > 0,
                  label: Text('$unreadCount'),
                  child: const Icon(Icons.notifications_outlined),
                ),
                selectedIcon: Badge(
                  isLabelVisible: unreadCount > 0,
                  label: Text('$unreadCount'),
                  child: const Icon(Icons.notifications, color: Color(0xFF0A66C2)),
                ),
                label: 'Alerts',
              ),
              const NavigationDestination(
                icon: Icon(Icons.work_outline),
                selectedIcon: Icon(Icons.work, color: Color(0xFF0A66C2)),
                label: 'Jobs',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
