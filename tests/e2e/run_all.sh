#!/usr/bin/env bash
# =============================================================================
# run_all.sh — Execute All 10 E2E Scenario Tests Sequentially
# =============================================================================
# Usage:
#   bash tests/e2e/run_all.sh [options]
#
# Options:
#   --skip-setup   Skip setup_personas.sh (use if tokens already exist)
#   --only S3,S7   Run only the listed scenarios (comma-separated)
#   --bail         Stop on first scenario failure
#
# Output:
#   Per-scenario logs written to /tmp/e2e_s{N}_results.txt
#   Summary printed to stdout
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# ── default flags ──────────────────────────────────────────────────────────
RUN_SETUP=true
BAIL=false
ONLY_SCENARIOS=()

# ── parse arguments ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-setup) RUN_SETUP=false ;;
        --bail)       BAIL=true ;;
        --only)
            shift
            IFS=',' read -ra ONLY_SCENARIOS <<< "$1"
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

# ── colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

header()  { printf "\n${BOLD}${CYAN}╔═══════════════════════════════════════════╗${RESET}\n"; \
            printf "${BOLD}${CYAN}║  %-43s║${RESET}\n" "$*"; \
            printf "${BOLD}${CYAN}╚═══════════════════════════════════════════╝${RESET}\n"; }
pass()    { printf "  ${GREEN}✔${RESET}  %s\n" "$*"; }
fail()    { printf "  ${RED}✘${RESET}  %s\n" "$*"; }
info()    { printf "  ${YELLOW}▸${RESET}  %s\n" "$*"; }

# ── prerequisites ──────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "ERROR: node not found. Install Node.js 18+." >&2
    exit 1
fi

if [[ "${RUN_SETUP}" == "true" ]]; then
    header "Setting Up Test Personas"
    bash "${SCRIPT_DIR}/setup_personas.sh"
else
    info "Skipping persona setup (--skip-setup)"
    # Verify token files exist
    for role in student alumni admin; do
        TOKEN_FILE="${PROJECT_ROOT}/.e2e_${role}_token"
        if [[ ! -f "${TOKEN_FILE}" ]]; then
            echo "ERROR: ${TOKEN_FILE} not found. Run without --skip-setup first." >&2
            exit 1
        fi
    done
fi

# ── determine scenarios to run ─────────────────────────────────────────────
ALL_SCENARIOS=(1 2 3 4 5 6 7 8 9 10)
if [[ ${#ONLY_SCENARIOS[@]} -gt 0 ]]; then
    SCENARIOS=()
    for s in "${ONLY_SCENARIOS[@]}"; do
        SCENARIOS+=("${s//[^0-9]/}")
    done
else
    SCENARIOS=("${ALL_SCENARIOS[@]}")
fi

# ── run scenarios ──────────────────────────────────────────────────────────
declare -A RESULTS
OVERALL_PASS=true

for N in "${SCENARIOS[@]}"; do
    SCENARIO_FILE="${SCRIPT_DIR}/test_s${N}.js"
    LOG_FILE="/tmp/e2e_s${N}_results.txt"

    if [[ ! -f "${SCENARIO_FILE}" ]]; then
        fail "test_s${N}.js not found — skipping"
        RESULTS[$N]="SKIP"
        continue
    fi

    header "S${N} — Running $(node -e "
        const s = require('fs').readFileSync('${SCENARIO_FILE}','utf8');
        const m = s.match(/S${N} — ([^\n*]+)/);
        process.stdout.write(m ? m[1].trim().substring(0,43) : 'Scenario ${N}');
    " 2>/dev/null || echo "Scenario ${N}")"

    START=$(date +%s%N)
    set +e
    node "${SCENARIO_FILE}" 2>&1 | tee "${LOG_FILE}"
    EXIT_CODE=${PIPESTATUS[0]}
    set -e
    END=$(date +%s%N)
    ELAPSED_MS=$(( (END - START) / 1000000 ))

    if [[ ${EXIT_CODE} -eq 0 ]]; then
        PASS_COUNT=$(grep -c '^\s*✔' "${LOG_FILE}" 2>/dev/null || echo 0)
        GAP_COUNT=$(grep -c '^\s*⚠' "${LOG_FILE}" 2>/dev/null || echo 0)
        pass "S${N} PASSED  (${PASS_COUNT} assertions, ${GAP_COUNT} gaps, ${ELAPSED_MS}ms)"
        RESULTS[$N]="PASS (${PASS_COUNT}✔ ${GAP_COUNT}⚠)"
    else
        FAIL_COUNT=$(grep -c '^\s*✘' "${LOG_FILE}" 2>/dev/null || echo "${EXIT_CODE}")
        fail "S${N} FAILED  (${FAIL_COUNT} failures, ${ELAPSED_MS}ms)"
        RESULTS[$N]="FAIL (exit=${EXIT_CODE})"
        OVERALL_PASS=false

        # show failing lines
        printf "${RED}"
        grep '^\s*✘' "${LOG_FILE}" 2>/dev/null | head -10 || true
        printf "${RESET}"

        if [[ "${BAIL}" == "true" ]]; then
            echo ""
            fail "Bailing on first failure (--bail). Remaining scenarios skipped."
            break
        fi
    fi
done

# ── summary table ──────────────────────────────────────────────────────────
header "E2E Test Suite Summary"
printf "  %-8s  %-10s  %s\n" "Scenario" "Status" "Detail"
printf "  %-8s  %-10s  %s\n" "--------" "------" "------"
for N in "${ALL_SCENARIOS[@]}"; do
    RESULT="${RESULTS[$N]:-NOT_RUN}"
    if [[ "${RESULT}" == PASS* ]]; then
        printf "  ${GREEN}%-8s  %-10s${RESET}  %s\n" "S${N}" "PASS" "${RESULT}"
    elif [[ "${RESULT}" == FAIL* ]]; then
        printf "  ${RED}%-8s  %-10s${RESET}  %s\n"   "S${N}" "FAIL" "${RESULT}"
    elif [[ "${RESULT}" == "SKIP" ]]; then
        printf "  ${YELLOW}%-8s  %-10s${RESET}  %s\n" "S${N}" "SKIP" "File not found"
    else
        printf "  ${YELLOW}%-8s  %-10s${RESET}  %s\n" "S${N}" "NOT_RUN" ""
    fi
done

echo ""
if [[ "${OVERALL_PASS}" == "true" ]]; then
    printf "${BOLD}${GREEN}All scenarios PASSED.${RESET}\n\n"
    exit 0
else
    printf "${BOLD}${RED}One or more scenarios FAILED. Check /tmp/e2e_s*_results.txt for details.${RESET}\n\n"
    exit 1
fi
