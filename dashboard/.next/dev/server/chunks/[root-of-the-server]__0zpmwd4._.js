module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[project]/app/api/workflows/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "runtime",
    ()=>runtime
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$github$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/github.ts [app-route] (ecmascript)");
;
;
const runtime = 'nodejs';
async function GET() {
    const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || 'Anujay-Saraf/Realtime-MLOPs';
    const token = process.env.NEXT_PUBLIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    try {
        // Workflow ID can be the filename or ID — use 'mlops-pipeline.yml'
        const runs = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$github$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fetchWorkflowRuns"])(repo, 'mlops-pipeline.yml', token, 10);
        const stats = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$github$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["calcPipelineStats"])(runs);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            runs: runs.map((r)=>({
                    id: r.id,
                    name: r.name,
                    branch: r.head_branch,
                    sha: r.head_sha.substring(0, 7),
                    status: r.status,
                    conclusion: r.conclusion,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                    run_number: r.run_number,
                    event: r.event,
                    url: r.html_url
                })),
            stats
        });
    } catch (err) {
        console.error('GitHub API error:', err);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Failed to fetch pipeline data',
            detail: String(err)
        }, {
            status: 500
        });
    }
}
}),
"[project]/lib/github.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Types for GitHub Actions API responses
__turbopack_context__.s([
    "PIPELINE_STAGES",
    ()=>PIPELINE_STAGES,
    "calcPipelineStats",
    ()=>calcPipelineStats,
    "fetchWorkflowRunWithJobs",
    ()=>fetchWorkflowRunWithJobs,
    "fetchWorkflowRuns",
    ()=>fetchWorkflowRuns,
    "formatDate",
    ()=>formatDate,
    "formatDuration",
    ()=>formatDuration,
    "getGitHubHeaders",
    ()=>getGitHubHeaders
]);
function getGitHubHeaders(token) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}
async function fetchWorkflowRuns(repo, workflowId, token, perPage = 10) {
    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/runs?per_page=${perPage}`;
    const res = await fetch(url, {
        headers: getGitHubHeaders(token),
        next: {
            revalidate: 30
        }
    });
    if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data.workflow_runs || [];
}
async function fetchWorkflowRunWithJobs(repo, runId, token) {
    const [runRes, jobsRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}`, {
            headers: getGitHubHeaders(token),
            next: {
                revalidate: 30
            }
        }),
        fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`, {
            headers: getGitHubHeaders(token),
            next: {
                revalidate: 30
            }
        })
    ]);
    if (!runRes.ok) return null;
    const run = await runRes.json();
    if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        run.jobs = jobsData.jobs || [];
    }
    return run;
}
function calcPipelineStats(runs) {
    const completed = runs.filter((r)=>r.status === 'completed');
    const successful = completed.filter((r)=>r.conclusion === 'success').length;
    const failed = completed.filter((r)=>r.conclusion === 'failure').length;
    // Estimate average duration from runs
    const durations = completed.map((r)=>{
        const start = new Date(r.created_at).getTime();
        const end = new Date(r.updated_at).getTime();
        return end - start;
    }).filter((d)=>d > 0);
    const avgMs = durations.length > 0 ? durations.reduce((a, b)=>a + b, 0) / durations.length : 0;
    const avgMin = Math.round(avgMs / 60000);
    return {
        totalRuns: runs.length,
        successfulRuns: successful,
        failedRuns: failed,
        avgDuration: avgMin > 0 ? `~${avgMin} min` : 'N/A'
    };
}
function formatDuration(start, end) {
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : Date.now();
    const diffMs = endMs - startMs;
    const min = Math.floor(diffMs / 60000);
    const sec = Math.floor(diffMs % 60000 / 1000);
    if (min > 0) return `${min}m ${sec}s`;
    return `${sec}s`;
}
function formatDate(iso) {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
const PIPELINE_STAGES = [
    'Build & Push API Image',
    'Build & Push Dashboard Image',
    'Deploy API to Azure',
    'Deploy Dashboard to Azure',
    'Generate Version Report'
];
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0zpmwd4._.js.map