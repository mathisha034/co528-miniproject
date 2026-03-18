import 'package:flutter/material.dart';

class InfrastructureScreen extends StatelessWidget {
  const InfrastructureScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    // Hardcoded demo values mirroring the React Web App Infrastructure Status page
    // Since we don't have a direct Kubernetes API exposure to the mobile app without the proxy.
    final externalServices = [
      {'name': 'MongoDB (StatefulSet)', 'status': 'Healthy', 'latency': '4ms'},
      {'name': 'Redis (Cache)', 'status': 'Healthy', 'latency': '2ms'},
      {'name': 'MinIO (Object Storage)', 'status': 'Healthy', 'latency': '12ms'},
      {'name': 'Keycloak (IAM)', 'status': 'Healthy', 'latency': '18ms'},
    ];

    final cicdStats = [
      {'name': 'Last Pipeline Run', 'value': 'Success (2 hrs ago)'},
      {'name': 'Terraform Drift', 'value': 'None'},
      {'name': 'Docker Images', 'value': '12 tags in Registry'},
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Infrastructure (Admin)'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Core Data Services', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                color: theme.cardTheme.color,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Column(
                children: externalServices.map((svc) => Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.storage, color: Colors.blueGrey),
                      title: Text(svc['name']!),
                      subtitle: Text('Latency: ${svc['latency']}'),
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.green.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'Healthy',
                          style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    if (svc != externalServices.last) const Divider(height: 1),
                  ],
                )).toList(),
              ),
            ),
            
            const SizedBox(height: 24),
            
            Text('CI/CD Pipeline History', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                color: theme.cardTheme.color,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Column(
                children: cicdStats.map((stat) => Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.commit, color: Colors.orange),
                      title: Text(stat['name']!),
                      trailing: Text(
                        stat['value']!, 
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    if (stat != cicdStats.last) const Divider(height: 1),
                  ],
                )).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
