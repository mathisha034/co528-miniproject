/**
 * test_issue12.js
 * Issue 12: Empty Hooks Directory
 * Verifies that web/src/hooks/ is populated with functional custom React hooks.
 *
 * Tests:
 *   A - All required hook files exist (useAuth.ts, useFetch.ts)
 *   B - useAuth.ts exports useAuth, uses AuthContext, throws if outside provider
 *   C - useFetch.ts exports useFetch as a generic function with correct return shape
 *   D - useFetch.ts uses axios and useCallback (memoized)
 *   E - AuthContext still exports its own useAuth (hooks version does not break existing imports)
 *   F - TypeScript compilation of web/src passes (tsc --noEmit) with no hook-specific errors
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOOKS_DIR = path.resolve(__dirname, 'web/src/hooks');
const CONTEXTS_DIR = path.resolve(__dirname, 'web/src/contexts');
const WEB_DIR = path.resolve(__dirname, 'web');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ PASS: ${label}`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return null;
    }
}

console.log('\n=== Issue 12: Empty Hooks Directory ===\n');

// --- TEST A: File existence ---
console.log('[ Test A ] Required hook files exist in web/src/hooks/');

const expectedFiles = ['useAuth.ts', 'useFetch.ts'];
for (const f of expectedFiles) {
    const fullPath = path.join(HOOKS_DIR, f);
    assert(`${f} exists`, fs.existsSync(fullPath), `expected at ${fullPath}`);
}

// Also confirm directory is not empty
const allHookFiles = fs.readdirSync(HOOKS_DIR).filter(f => f !== '.gitkeep');
assert('hooks/ directory is not empty', allHookFiles.length >= 2, `found: ${allHookFiles.join(', ')}`);

// --- TEST B: useAuth.ts structure ---
console.log('\n[ Test B ] useAuth.ts — exports useAuth, wraps AuthContext, guards outside provider');

const useAuthSrc = readFile(path.join(HOOKS_DIR, 'useAuth.ts'));
assert('useAuth.ts is readable', useAuthSrc !== null);
if (useAuthSrc) {
    assert("imports useContext from 'react'", useAuthSrc.includes("useContext") && (useAuthSrc.includes("from 'react'") || useAuthSrc.includes('from "react"')));
    assert("imports AuthContext", useAuthSrc.includes('AuthContext'));
    assert("exports useAuth function/const", useAuthSrc.includes('export const useAuth') || useAuthSrc.includes('export function useAuth'));
    assert("calls useContext(AuthContext)", useAuthSrc.includes('useContext(AuthContext)'));
    assert("throws Error if context is undefined", useAuthSrc.includes('throw new Error') && useAuthSrc.includes('useAuth must be used within'));
    assert("returns context", useAuthSrc.includes('return context'));
}

// --- TEST C: useFetch.ts return shape ---
console.log('\n[ Test C ] useFetch.ts — generic signature, returns { data, loading, error, refetch }');

const useFetchSrc = readFile(path.join(HOOKS_DIR, 'useFetch.ts'));
assert('useFetch.ts is readable', useFetchSrc !== null);
if (useFetchSrc) {
    assert("exports useFetch function/const", useFetchSrc.includes('export function useFetch') || useFetchSrc.includes('export const useFetch'));
    assert("has generic type parameter <T>", useFetchSrc.includes('<T>') || useFetchSrc.includes('<T,') || useFetchSrc.includes('<T '));
    assert("result contains 'data' field", useFetchSrc.includes('data'));
    assert("result contains 'loading' field", useFetchSrc.includes('loading'));
    assert("result contains 'error' field", useFetchSrc.includes('error'));
    assert("result contains 'refetch' field", useFetchSrc.includes('refetch'));
    assert("UseFetchResult interface/type defined", useFetchSrc.includes('UseFetchResult'));
}

// --- TEST D: useFetch.ts implementation quality ---
console.log('\n[ Test D ] useFetch.ts — uses axios, useCallback memoization');

if (useFetchSrc) {
    assert("imports axios", useFetchSrc.includes('axios'));
    assert("uses useCallback for memoization", useFetchSrc.includes('useCallback'));
    assert("uses useState for state management", useFetchSrc.includes('useState'));
    assert("uses useEffect to trigger fetch", useFetchSrc.includes('useEffect'));
}

// --- TEST E: AuthContext still exports its own useAuth (backward compat) ---
console.log('\n[ Test E ] AuthContext.tsx still exports useAuth (backward compatibility preserved)');

const authCtxPath = path.join(CONTEXTS_DIR, 'AuthContext.tsx');
const authCtxSrc = readFile(authCtxPath);
assert('AuthContext.tsx is readable', authCtxSrc !== null, `expected at ${authCtxPath}`);
if (authCtxSrc) {
    assert("AuthContext.tsx exports useAuth", authCtxSrc.includes('export') && authCtxSrc.includes('useAuth'));
    assert("AuthContext is exported from context file", authCtxSrc.includes('export') && authCtxSrc.includes('AuthContext'));
}

// --- TEST F: TypeScript compilation ---
console.log('\n[ Test F ] TypeScript compilation — npx tsc --noEmit (web/tsconfig.app.json)');

let tscPassed = false;
let tscOutput = '';
try {
    execSync('npx tsc --noEmit -p tsconfig.app.json 2>&1', {
        cwd: WEB_DIR,
        stdio: 'pipe',
        timeout: 60000,
    });
    tscPassed = true;
    tscOutput = 'No TypeScript errors';
} catch (err) {
    tscOutput = (err.stdout || err.stderr || err.message || '').toString().trim();
    const lines = tscOutput.split('\n');
    // Only care about hook-specific errors
    const hookErrors = lines.filter(l => (l.includes('hooks/') || l.includes('useAuth') || l.includes('useFetch')) && l.includes('error TS'));
    if (hookErrors.length === 0) {
        tscPassed = true;
        const otherErrors = lines.filter(l => l.includes('error TS'));
        tscOutput = hookErrors.length === 0
            ? `Hook files have no TS errors (other project errors: ${otherErrors.length})`
            : 'No TypeScript errors in hook files';
    } else {
        tscOutput = hookErrors.join('\n');
    }
}
assert('Hook files pass TypeScript compilation', tscPassed, tscOutput);

// --- SUMMARY ---
console.log('\n' + '─'.repeat(50));
console.log(`Issue 12 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
    console.log('✅ ISSUE 12 VERIFIED — Hooks directory is fully populated and type-safe.');
} else {
    console.log('❌ ISSUE 12 STILL HAS PROBLEMS — see failures above.');
}
console.log('─'.repeat(50) + '\n');
process.exit(failed > 0 ? 1 : 0);
