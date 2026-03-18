import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/repositories/auth_repository.dart';
import 'edit_profile_modal.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () {
              // Open Settings Modal / Screen
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authRepositoryProvider).logout();
              if (context.mounted) {
                context.go('/');
              }
            },
            tooltip: 'Log Out',
          ),
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Profile Header Card
            Container(
              color: theme.cardTheme.color,
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const CircleAvatar(
                        radius: 40,
                        backgroundColor: Color(0xFFE0E0E0),
                        child: Icon(Icons.person, size: 40, color: Colors.grey),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'John Doe',
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Computer Science Department',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: Colors.grey[600],
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              children: [
                                Chip(
                                  label: const Text('Student', style: TextStyle(fontSize: 12)),
                                  padding: EdgeInsets.zero,
                                  backgroundColor: theme.colorScheme.primary.withOpacity(0.1),
                                  labelStyle: TextStyle(color: theme.colorScheme.primary),
                                  side: BorderSide.none,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () {
                            showEditProfileModal(context);
                          },
                          style: OutlinedButton.styleFrom(
                            side: BorderSide(color: theme.colorScheme.primary),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                            ),
                          ),
                          child: const Text('Edit Profile'),
                        ),
                      ),
                    ],
                  )
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Profile Details
            Container(
              color: theme.cardTheme.color,
              padding: const EdgeInsets.all(16.0),
              width: double.infinity,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'About',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Passionate computer science student looking for exciting opportunities in software engineering.',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Container(
              color: theme.cardTheme.color,
              child: Column(
                children: [
                  ListTile(
                    leading: Icon(Icons.picture_as_pdf, color: theme.colorScheme.primary),
                    title: const Text('Research Hub'),
                    subtitle: const Text('View collaborative projects'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      context.push('/research');
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: Icon(Icons.analytics, color: Colors.purple[400]),
                    title: const Text('System Analytics'),
                    subtitle: const Text('Metrics & Latency (Admin)'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      context.push('/analytics');
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: Icon(Icons.developer_board, color: Colors.blueGrey[400]),
                    title: const Text('Infrastructure Status'),
                    subtitle: const Text('Databases & CI/CD (Admin)'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      context.push('/infrastructure');
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
