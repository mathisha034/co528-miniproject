import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import '../providers/analytics_provider.dart';

class AnalyticsScreen extends ConsumerStatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  ConsumerState<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends ConsumerState<AnalyticsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(analyticsProvider.notifier).fetchAllAnalytics();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(analyticsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Analytics'),
      ),
      body: state.isLoading || state.overview == null
          ? const Center(child: CircularProgressIndicator())
          : state.error != null
              ? Center(child: Text('Error: ${state.error}'))
              : RefreshIndicator(
                  onRefresh: () => ref.read(analyticsProvider.notifier).fetchAllAnalytics(),
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Overview Cards
                        GridView.count(
                          crossAxisCount: 2,
                          crossAxisSpacing: 16,
                          mainAxisSpacing: 16,
                          childAspectRatio: 1.5,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          children: [
                            _buildStatCard(theme, 'Active Users', state.overview!.totalUsers.toString(), Icons.people, Colors.blue),
                            _buildStatCard(theme, 'Total Posts', state.overview!.totalPosts.toString(), Icons.article, Colors.green),
                            _buildStatCard(theme, 'Active Jobs', state.overview!.totalJobs.toString(), Icons.work, Colors.purple),
                            _buildStatCard(theme, 'Events', state.overview!.totalEvents.toString(), Icons.event, Colors.orange),
                          ],
                        ),
                        
                        const SizedBox(height: 24),
                        
                        // Registration Chart
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: theme.cardTheme.color,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.grey.shade200),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Daily Registrations', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                              const SizedBox(height: 16),
                              SizedBox(
                                height: 200,
                                child: state.userRegistrations.isEmpty
                                    ? const Center(child: Text('No data'))
                                    : BarChart(
                                        BarChartData(
                                          alignment: BarChartAlignment.spaceAround,
                                          maxY: state.userRegistrations.map((e) => e.count).reduce((a, b) => a > b ? a : b).toDouble() * 1.2,
                                          barTouchData: BarTouchData(enabled: false),
                                          titlesData: FlTitlesData(
                                            show: true,
                                            bottomTitles: AxisTitles(
                                              sideTitles: SideTitles(
                                                showTitles: true,
                                                getTitlesWidget: (value, meta) {
                                                  if (value.toInt() >= 0 && value.toInt() < state.userRegistrations.length) {
                                                    // Just show day part
                                                    final dateString = state.userRegistrations[value.toInt()].date;
                                                    final day = dateString.split('-').last;
                                                    return Text(day, style: const TextStyle(fontSize: 10));
                                                  }
                                                  return const Text('');
                                                },
                                              ),
                                            ),
                                            leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                                            topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                                            rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                                          ),
                                          borderData: FlBorderData(show: false),
                                          barGroups: state.userRegistrations.asMap().entries.map((entry) {
                                            return BarChartGroupData(
                                              x: entry.key,
                                              barRods: [
                                                BarChartRodData(
                                                  toY: entry.value.count.toDouble(),
                                                  color: theme.colorScheme.primary,
                                                  width: 16,
                                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                                                ),
                                              ],
                                            );
                                          }).toList(),
                                        ),
                                      ),
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 24),

                        // Infrastructure Letencies
                        Text('System Infrastructure', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                         ...state.serviceMetrics.map((metric) => ListTile(
                           contentPadding: EdgeInsets.zero,
                           leading: Icon(
                             Icons.dns, 
                             color: metric.isHealthy ? Colors.green : Colors.red,
                           ),
                           title: Text(metric.serviceName),
                           trailing: Container(
                             padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                             decoration: BoxDecoration(
                               color: metric.latestLatencyMs > 500 ? Colors.red.withOpacity(0.1) : Colors.green.withOpacity(0.1),
                               borderRadius: BorderRadius.circular(4),
                             ),
                             child: Text(
                               '${metric.latestLatencyMs.toStringAsFixed(0)} ms',
                               style: TextStyle(
                                 color: metric.latestLatencyMs > 500 ? Colors.red : Colors.green[800],
                                 fontWeight: FontWeight.bold,
                               ),
                             ),
                           ),
                         )),
                      ],
                    ),
                  ),
                ),
    );
  }

  Widget _buildStatCard(ThemeData theme, String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.cardTheme.color,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
