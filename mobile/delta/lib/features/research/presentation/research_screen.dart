import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart';
import '../providers/research_provider.dart';
import '../models/research_model.dart';

class ResearchScreen extends ConsumerStatefulWidget {
  const ResearchScreen({super.key});

  @override
  ConsumerState<ResearchScreen> createState() => _ResearchScreenState();
}

class _ResearchScreenState extends ConsumerState<ResearchScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(researchProvider.notifier).fetchProjects();
    });
  }

  Future<void> _launchUrl(String urlString) async {
    final Uri url = Uri.parse(urlString);
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open document.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final researchState = ref.watch(researchProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Research Hub'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            onPressed: () {
              // TODO: Open Create Project Modal
            },
          ),
        ],
      ),
      body: researchState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : researchState.error != null
              ? Center(child: Text('Error: ${researchState.error}'))
              : researchState.projects.isEmpty
                  ? const Center(child: Text('No research projects found.'))
                  : RefreshIndicator(
                      onRefresh: () => ref.read(researchProvider.notifier).fetchProjects(),
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: researchState.projects.length,
                        separatorBuilder: (context, index) => const SizedBox(height: 16),
                        itemBuilder: (context, index) {
                          return _buildProjectCard(theme, researchState.projects[index]);
                        },
                      ),
                    ),
    );
  }

  Widget _buildProjectCard(ThemeData theme, ResearchProject project) {
    final formatter = DateFormat('MMM d, yyyy');

    Color getStatusColor() {
      switch (project.status) {
        case 'ONGOING': return Colors.green;
        case 'ARCHIVED': return Colors.grey;
        case 'COMPLETED': return Colors.blue;
        default: return theme.colorScheme.primary;
      }
    }

    return Container(
      decoration: BoxDecoration(
        color: theme.cardTheme.color,
        border: Border.all(color: Colors.grey.withOpacity(0.2)),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.02),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: getStatusColor().withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  project.status,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: getStatusColor(),
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Text(
                formatter.format(project.updatedAt),
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            project.title,
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            project.description,
            style: theme.textTheme.bodyMedium,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 16),
          
          // Tags
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: project.tags.map((tag) => Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.grey[100],
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                tag,
                style: theme.textTheme.labelSmall?.copyWith(color: Colors.grey[800]),
              ),
            )).toList(),
          ),

          if (project.documents.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Divider(),
            const SizedBox(height: 8),
            Text(
              'Documents',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            ...project.documents.map((doc) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.picture_as_pdf, color: Colors.red[400]),
              title: Text(doc.filename, maxLines: 1, overflow: TextOverflow.ellipsis),
              trailing: IconButton(
                icon: const Icon(Icons.download_rounded),
                onPressed: () => _launchUrl(doc.url),
              ),
            )),
          ]
        ],
      ),
    );
  }
}
