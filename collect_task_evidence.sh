#!/bin/bash

# Task V7.0 Mobile Auth Runtime Hardening - Evidence Collection & Verification Script
# Purpose: Automate collection of evidence for Tasks 4 and 8 completion
# Usage: bash collect_task_evidence.sh

set -e

EVIDENCE_DIR="$HOME/task_v7_evidence_$(date +%Y%m%d_%H%M%S)"
PROJECT_ROOT="/home/gintoki/Semester07/CO528/mini_project"
MOBILE_ROOT="$PROJECT_ROOT/mobile/delta"

echo "=========================================="
echo "Task V7.0 Evidence Collection Started"
echo "Evidence directory: $EVIDENCE_DIR"
echo "=========================================="

mkdir -p "$EVIDENCE_DIR"

# Phase 1: Static Analysis
echo ""
echo "[Phase 1] Running Flutter Analyzer..."
cd "$MOBILE_ROOT"
flutter analyze > "$EVIDENCE_DIR/01_flutter_analyze.txt" 2>&1 || true
echo "✓ Analyzer results saved"

# Extract summary
WARNINGS=$(grep -c "warning" "$EVIDENCE_DIR/01_flutter_analyze.txt" || echo "0")
INFOS=$(grep "issues found" "$EVIDENCE_DIR/01_flutter_analyze.txt" | grep -oE '[0-9]+ issues' || echo "0 issues")
echo "  → $INFOS ($WARNINGS warnings)"

# Phase 2: Unit Tests
echo ""
echo "[Phase 2] Running Unit Tests..."
flutter test > "$EVIDENCE_DIR/02_flutter_test.txt" 2>&1 || true
echo "✓ Test results saved"

# Extract test stat
TEST_COUNT=$(grep -oE '\+[0-9]+:' "$EVIDENCE_DIR/02_flutter_test.txt" | tail -1 | grep -oE '[0-9]+' || echo "?")
echo "  → $TEST_COUNT tests executed"

# Phase 3: Device Status
echo ""
echo "[Phase 3] Device Information..."
flutter devices > "$EVIDENCE_DIR/03_flutter_devices.txt" 2>&1 || true
echo "✓ Device list saved"

grep -E "SM X510|R52XA09G67W|Android 16" "$EVIDENCE_DIR/03_flutter_devices.txt" && \
  echo "  → Physical device (SM X510) found and connected" || \
  echo "  → WARNING: Physical device not detected"

# Phase 4: Infrastructure Checks
echo ""
echo "[Phase 4] Infrastructure Connectivity..."
{
  echo "=== Cluster Status ==="
  kubectl get pods -n miniproject 2>&1 || echo "ERROR: Cluster unreachable"
  echo ""
  echo "=== Keycloak OIDC Endpoint ==="
  curl -ksS -m 5 https://miniproject.local/.well-known/openid-configuration 2>&1 || echo "ERROR: OIDC endpoint unreachable"
} > "$EVIDENCE_DIR/04_infrastructure_checks.txt" 2>&1 || true
echo "✓ Infrastructure checks saved"

if grep -q "ERROR: Cluster unreachable\|ERROR: OIDC endpoint" "$EVIDENCE_DIR/04_infrastructure_checks.txt"; then
  echo "  → ⚠️  Infrastructure currently unreachable - device testing blocked"
elif grep -q "\-\-\-\-\-" "$EVIDENCE_DIR/04_infrastructure_checks.txt"; then
  echo "  → ✓ Infrastructure healthy - ready for device testing"
else
  echo "  → ⚠️  Infrastructure status unknown"
fi

# Phase 5: Code Review Checklist
echo ""
echo "[Phase 5] Code Review Checklist..."
{
  echo "### V7.0 Implementation Checklist"
  echo ""
  echo "**Task 1: Runtime Config Layer**"
  if [ -f "$MOBILE_ROOT/lib/core/config/app_config.dart" ]; then
    echo "- ✓ AppConfig module exists"
    grep -q "enum AppEnvironment" "$MOBILE_ROOT/lib/core/config/app_config.dart" && echo "- ✓ AppEnvironment enum defined" || echo "- ✗ AppEnvironment enum missing"
    grep -q "String.fromEnvironment" "$MOBILE_ROOT/lib/core/config/app_config.dart" && echo "- ✓ Runtime config via dart-define" || echo "- ✗ dart-define not used"
  else
    echo "- ✗ AppConfig module missing"
  fi
  
  echo ""
  echo "**Task 2: AuthRepository Refactor**"
  ! grep -q "http://10.0.2.2:8081" "$MOBILE_ROOT/lib/features/auth/repositories/auth_repository.dart" && \
    echo "- ✓ Hardcoded OIDC URL removed" || echo "- ✗ Hardcoded OIDC URL still present"
  ! grep -q "\\bprint(" "$MOBILE_ROOT/lib/features/auth/repositories/auth_repository.dart" && \
    echo "- ✓ Print statements removed" || echo "- ✗ Print statements still present"
  grep -q "appConfigProvider\|AppConfig" "$MOBILE_ROOT/lib/features/auth/repositories/auth_repository.dart" && \
    echo "- ✓ AppConfig consumed" || echo "- ✗ AppConfig not consumed"
  
  echo ""
  echo "**Task 3: Dio Client Refactor**"
  ! grep -q "miniproject\\.local" "$MOBILE_ROOT/lib/core/network/dio_client.dart" && \
    echo "- ✓ Hardcoded API URL removed" || echo "- ✗ Hardcoded API URL still present"
  grep -q "appConfigProvider\|AppConfig" "$MOBILE_ROOT/lib/core/network/dio_client.dart" && \
    echo "- ✓ Config-driven base URL" || echo "- ✗ Base URL not config-driven"
  
  echo ""
  echo "**Task 5: Token Lifecycle**"
  grep -q "access_token_expires_at\|getValidAccessToken\|refreshAccessToken" "$MOBILE_ROOT/lib/features/auth/repositories/auth_repository.dart" && \
    echo "- ✓ Token expiry tracking and refresh" || echo "- ✗ Token lifecycle not implemented"
  
  echo ""
  echo "**Task 6: Router Guards**"
  grep -q "goRouterProvider\|resolveAuthRedirect" "$MOBILE_ROOT/lib/core/router/app_router.dart" && \
    echo "- ✓ Router redirect guards" || echo "- ✗ Router guards missing"
  grep -q "goRouterProvider" "$MOBILE_ROOT/lib/main.dart" && \
    echo "- ✓ Provider injected in main" || echo "- ✗ Provider not injected"
  
  echo ""
  echo "**Task 7: Quality Cleanup**"
  ! grep -qE "import.*go_router.*\n.*import.*go_router" "$MOBILE_ROOT/lib/features/profile/presentation/profile_screen.dart" && \
    echo "- ✓ Duplicate imports removed" || echo "- ✗ Duplicate imports still present"
  
} > "$EVIDENCE_DIR/05_code_review_checklist.txt"
echo "✓ Code review checklist created"
cat "$EVIDENCE_DIR/05_code_review_checklist.txt"

# Phase 6: Generate Summary
echo ""
echo "[Phase 6] Generating Summary Report..."
{
  echo "# Task V7.0 Evidence Summary"
  echo ""
  echo "**Collection Date:** $(date)"
  echo "**Project Root:** $PROJECT_ROOT"
  echo "**Evidence Directory:** $EVIDENCE_DIR"
  echo ""
  echo "## Files Collected"
  echo "1. 01_flutter_analyze.txt - Static code analysis results"
  echo "2. 02_flutter_test.txt - Unit test execution results"
  echo "3. 03_flutter_devices.txt - Connected device information"
  echo "4. 04_infrastructure_checks.txt - Cluster and OIDC endpoint status"
  echo "5. 05_code_review_checklist.txt - Implementation verification"
  echo ""
  echo "## Quick Status"
  echo "| Aspect | Status |"
  echo "|--------|--------|"
  
  # Analyzer status
  if grep -q "warnings, " "$EVIDENCE_DIR/01_flutter_analyze.txt"; then
    WARNS=$(grep "warnings, " "$EVIDENCE_DIR/01_flutter_analyze.txt" | grep -oE '[0-9]+ warning' | head -1)
    [[ "$WARNS" == "0 warning"* ]] && echo "| Analyzer | ✓ $WARNS |" || echo "| Analyzer | ⚠️ $WARNS |"
  else
    echo "| Analyzer | ? (Check manually) |"
  fi
  
  # Test status
  if grep -q "All tests passed" "$EVIDENCE_DIR/02_flutter_test.txt"; then
    TESTS=$(grep "All tests passed" "$EVIDENCE_DIR/02_flutter_test.txt" | grep -oE '\+[0-9]+' | grep -oE '[0-9]+')
    echo "| Tests | ✓ $TESTS passed |"
  else
    echo "| Tests | ✗ (Check manually) |"
  fi
  
  # Device status
  if grep -q "SM X510.*R52XA09G67W" "$EVIDENCE_DIR/03_flutter_devices.txt"; then
    echo "| Device Connected | ✓ SM X510 (Android 16) |"
  else
    echo "| Device Connected | ✗ Not detected |"
  fi
  
  # Infrastructure status
  if grep -q "ERROR" "$EVIDENCE_DIR/04_infrastructure_checks.txt"; then
    echo "| Infrastructure | ✗ Unreachable |"
  elif grep -q "miniproject" "$EVIDENCE_DIR/04_infrastructure_checks.txt"; then
    echo "| Infrastructure | ✓ Reachable |"
  else
    echo "| Infrastructure | ⚠️ Unknown |"
  fi
  
  echo ""
  echo "## Next Steps"
  echo "1. Review evidence files in: $EVIDENCE_DIR"
  echo "2. If infrastructure is down: Wait for cluster restoration"
  echo "3. If infrastructure is up: Execute device testing per task_V7_device_testing_procedure.md"
  echo "4. For device results: Manually log test outcomes in evidence directory"
  echo ""
  
} > "$EVIDENCE_DIR/SUMMARY.md"

echo ""
echo "=========================================="
echo "Evidence Collection Complete"
echo "Summary Report: $EVIDENCE_DIR/SUMMARY.md"
echo "=========================================="
cat "$EVIDENCE_DIR/SUMMARY.md"
