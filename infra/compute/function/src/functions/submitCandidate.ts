import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { randomUUID } from "crypto";
import { CandidateSubmission, SubmissionResponse, ContactRecord, TurnstileVerifyResponse } from "../types.js";

// Environment variables
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY!;
const IS_LOCAL_DEV = process.env.IS_LOCAL_DEV === "true"; // Skip Turnstile validation
const CONTACT_STORAGE_CONNECTION = process.env.CONTACT_STORAGE_CONNECTION!;
const CONTACT_CONTAINER_NAME = process.env.CONTACT_CONTAINER_NAME!;
const GITHUB_APP_ID = process.env.GITHUB_APP_ID!;
const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY!;
const GITHUB_APP_INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID!;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER!;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME!;           // Main repo for PRs
const GITHUB_FORM_REPO_NAME = process.env.GITHUB_FORM_REPO_NAME!; // Fork repo for branches

// CORS: allowed origins from env (comma-separated) or fallback to prod default
const ALLOWED_ORIGINS: string[] = (
    process.env.ALLOWED_ORIGINS || "https://www.democracycandidate.us"
).split(",").map(o => o.trim()).filter(Boolean);

/**
 * Return CORS headers for a given request origin.
 * Always returns the specific requesting origin (not wildcard) so credentials work.
 */
function getCorsHeaders(request: HttpRequest): Record<string, string> {
    const origin = request.headers.get("origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    };
}

/**
 * Safely parse GitHub App private key from environment variable.
 * Handles various formats: base64, escaped newlines, missing headers, etc.
 */
function parseGitHubPrivateKey(rawKey: string): string | null {
    if (!rawKey || rawKey.includes('your-private-key-here') || rawKey.includes('your-github-app')) {
        return null; // Placeholder value
    }

    let key = rawKey.trim();

    // Handle escaped newlines (\n -> actual newlines)
    key = key.replace(/\\n/g, '\n');

    // If it doesn't have the PEM header/footer, add them
    if (!key.includes('BEGIN')) {
        key = `-----BEGIN RSA PRIVATE KEY-----\n${key}\n-----END RSA PRIVATE KEY-----`;
    }

    // Ensure proper formatting with newlines after header and before footer
    key = key.replace(/-----BEGIN RSA PRIVATE KEY-----\s*/, '-----BEGIN RSA PRIVATE KEY-----\n');
    key = key.replace(/\s*-----END RSA PRIVATE KEY-----/, '\n-----END RSA PRIVATE KEY-----');

    // Verify it looks like a valid key (has header, footer, and some content)
    if (!key.includes('BEGIN RSA PRIVATE KEY') || !key.includes('END RSA PRIVATE KEY')) {
        return null;
    }

    // Extract the base64 content between header and footer
    const lines = key.split('\n');
    const contentLines = lines.filter(line => 
        !line.includes('BEGIN') && !line.includes('END') && line.trim()
    );
    
    // Join all content and remove any spaces
    const content = contentLines.join('').replace(/\s/g, '');

    if (content.length < 100) { // RSA keys should be much longer
        return null;
    }

    // Reformat: split base64 content into 64-character lines (standard PEM format)
    const formattedLines = [];
    for (let i = 0; i < content.length; i += 64) {
        formattedLines.push(content.substring(i, i + 64));
    }

    // Reconstruct the key with proper line breaks
    return `-----BEGIN RSA PRIVATE KEY-----\n${formattedLines.join('\n')}\n-----END RSA PRIVATE KEY-----`;
}

const GITHUB_PRIVATE_KEY_SAFE = parseGitHubPrivateKey(GITHUB_APP_PRIVATE_KEY);

/**
 * Validate Cloudflare Turnstile token
 */
async function verifyTurnstile(token: string): Promise<boolean> {
    // Skip validation in local development environment
    if (IS_LOCAL_DEV) {
        return true;
    }
    
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            secret: TURNSTILE_SECRET_KEY,
            response: token,
        }),
    });

    const result = await response.json() as TurnstileVerifyResponse;
    return result.success;
}

/**
 * Store contact info in blob storage
 */
async function storeContactInfo(record: ContactRecord): Promise<void> {
    const blobServiceClient = BlobServiceClient.fromConnectionString(CONTACT_STORAGE_CONNECTION);
    const containerClient = blobServiceClient.getContainerClient(CONTACT_CONTAINER_NAME);
    
    // Ensure container exists (safe for both local and prod)
    await containerClient.createIfNotExists();
    
    const blobClient = containerClient.getBlockBlobClient(`${record.correlationId}.json`);

    await blobClient.upload(
        JSON.stringify(record, null, 2),
        JSON.stringify(record, null, 2).length,
        { blobHTTPHeaders: { blobContentType: "application/json" } }
    );
}

/**
 * Create authenticated Octokit instance using GitHub App
 */
async function getOctokit(): Promise<Octokit> {
    if (!GITHUB_PRIVATE_KEY_SAFE) {
        throw new Error('GitHub private key is not configured or invalid');
    }

    const auth = createAppAuth({
        appId: GITHUB_APP_ID,
        privateKey: GITHUB_PRIVATE_KEY_SAFE,
        installationId: parseInt(GITHUB_APP_INSTALLATION_ID, 10),
    });

    const { token } = await auth({ type: "installation" });
    return new Octokit({ auth: token });
}

/**
 * Normalize filename: lowercase, replace spaces/special chars with dashes
 */
function normalizeFilename(filename: string): string {
    // Extract extension
    const lastDot = filename.lastIndexOf('.');
    const name = lastDot > 0 ? filename.substring(0, lastDot) : filename;
    const ext = lastDot > 0 ? filename.substring(lastDot) : '';
    
    // Normalize name: lowercase, replace non-alphanumeric with dashes, remove duplicate dashes
    const normalized = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
    
    return normalized + ext.toLowerCase();
}

/**
 * Update markdown content to use normalized image paths
 */
function normalizeMarkdownImagePaths(content: string, imageMap: Map<string, string>): string {
    let updated = content;
    
    // Replace image references: ![alt](oldpath) -> ![alt](normalizedpath)
    imageMap.forEach((normalizedPath, originalPath) => {
        // Match various markdown image syntaxes
        const patterns = [
            new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegex(originalPath)}\\)`, 'g'),
            new RegExp(`!\\[([^\\]]*)\\]\\(\\.\\/\\.\\.\\/\\.\\.\\/assets\\/images\\/${escapeRegex(originalPath)}\\)`, 'g'),
            new RegExp(`!\\[([^\\]]*)\\]\\(images\\/${escapeRegex(originalPath)}\\)`, 'g'),
        ];
        
        patterns.forEach(pattern => {
            updated = updated.replace(pattern, `![$1](${normalizedPath})`);
        });
    });
    
    return updated;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate Hugo frontmatter from submission
 */
function generateFrontmatter(submission: CandidateSubmission, avatarFilename?: string, imageFilename?: string): string {
    const optionalFields: string[] = [];
    if (submission.website) {
        optionalFields.push(`website: "${submission.website}"`);
    }
    const optionalBlock = optionalFields.length > 0 ? '\n' + optionalFields.join('\n') : '';

    return `---
title: "${submission.title}"
meta_title: "${submission.candidate} for ${submission.title}"
description: "${submission.candidate} for ${submission.title}"
candidate: "${submission.candidate}"
party: "${submission.party}"
election_date: ${submission.electionDate}T12:00:00Z
image: "${imageFilename || ""}"
categories: ${JSON.stringify(submission.categories)}
tags: ${JSON.stringify(submission.tags)}
draft: false
avatar: "${avatarFilename || ""}"
about: "${submission.about.replace(/"/g, '\\"')}"${optionalBlock}
---

${submission.content}
`;
}

/**
 * Create branch, commit files, and open PR
 */
async function createCandidatePR(
    octokit: Octokit,
    submission: CandidateSubmission,
    correlationId: string,
    context: InvocationContext
): Promise<string> {
    const slug = submission.candidate.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const branchName = `form-${slug}-${correlationId.slice(0, 8)}`;
    
    // Extract year from election date for folder structure
    const year = submission.electionDate.split('-')[0];
    const candidatePath = `src/content/english/candidates/${year}/${slug}`;

    // Helper to check if file is SVG (text-based, not binary)
    const isSVG = (filename: string): boolean => {
        return filename.toLowerCase().endsWith('.svg');
    };

    // Get default branch SHA from formsubmissions repo (where we'll create the branch)
    const { data: formRepo } = await octokit.repos.get({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_FORM_REPO_NAME,
    });

    const { data: ref } = await octokit.git.getRef({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_FORM_REPO_NAME,
        ref: `heads/${formRepo.default_branch}`,
    });

    // Get main repo info (for PR base branch)
    const { data: mainRepo } = await octokit.repos.get({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
    });

    // Create branch in formsubmissions repo
    await octokit.git.createRef({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_FORM_REPO_NAME,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha,
    });

    context.log(`Created branch ${branchName} in ${GITHUB_FORM_REPO_NAME}`);

    // Prepare files to commit
    const files: Array<{ path: string; content: string; encoding?: 'base64' | 'utf-8' }> = [];
    const imageMap = new Map<string, string>(); // Track original -> normalized paths for markdown updates

    // Process avatar image
    let avatarFilename: string | undefined;
    if (submission.avatarImage) {
        avatarFilename = normalizeFilename(`${slug}-avatar.jpg`);
        const base64Data = submission.avatarImage.replace(/^data:image\/\w+;base64,/, "");
        files.push({
            path: `${candidatePath}/${avatarFilename}`,
            content: base64Data,
            encoding: 'base64',
        });
    }

    // Process title image
    let imageFilename: string | undefined;
    if (submission.titleImage) {
        imageFilename = normalizeFilename(`${slug}-title.jpg`);
        const base64Data = submission.titleImage.replace(/^data:image\/\w+;base64,/, "");
        files.push({
            path: `${candidatePath}/${imageFilename}`,
            content: base64Data,
            encoding: 'base64',
        });
    }

    // Process inline images with normalization
    if (submission.additionalImages && submission.additionalImages.length > 0) {
        submission.additionalImages.forEach(img => {
            // Extract just the filename from the path
            const originalFilename = img.path.split('/').pop() || img.path;
            const normalizedFilename = normalizeFilename(originalFilename);
            
            // Track the mapping for markdown content updates
            imageMap.set(originalFilename, normalizedFilename);
            imageMap.set(img.path, normalizedFilename); // Also map full path
            
            if (isSVG(normalizedFilename)) {
                // SVG files: decode base64 to UTF-8 text
                files.push({
                    path: `${candidatePath}/${normalizedFilename}`,
                    content: Buffer.from(img.content, 'base64').toString('utf-8'),
                    // No encoding = text file
                });
            } else {
                // Binary images (PNG, JPG, etc.): keep as base64
                files.push({
                    path: `${candidatePath}/${normalizedFilename}`,
                    content: img.content,
                    encoding: 'base64',
                });
            }
        });
    }

    // Update markdown content with normalized image paths
    const normalizedContent = normalizeMarkdownImagePaths(submission.content, imageMap);

    // Generate and add index.md with normalized content
    const frontmatter = generateFrontmatter(
        { ...submission, content: normalizedContent },
        avatarFilename,
        imageFilename
    );
    files.push({
        path: `${candidatePath}/index.md`,
        content: frontmatter,
        // No encoding specified = UTF-8 text (default)
    });

    // Create tree with all files
    const { data: baseTree } = await octokit.git.getTree({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_FORM_REPO_NAME,
        tree_sha: ref.object.sha,
    });

    // Create blobs for all files and build tree items
    const treeItems = await Promise.all(files.map(async (file) => {
        if (file.encoding === 'base64') {
            // For binary files, create blob separately with base64 encoding
            const { data: blob } = await octokit.git.createBlob({
                owner: GITHUB_REPO_OWNER,
                repo: GITHUB_FORM_REPO_NAME,
                content: file.content,
                encoding: 'base64',
            });
            
            return {
                path: file.path,
                mode: "100644" as const,
                type: "blob" as const,
                sha: blob.sha,
            };
        } else {
            // For text files, use inline content
            return {
                path: file.path,
                mode: "100644" as const,
                type: "blob" as const,
                content: file.content,
            };
        }
    }));

    const { data: newTree } = await octokit.git.createTree({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_FORM_REPO_NAME,
        base_tree: baseTree.sha,
        tree: treeItems,
    });

    // Create commit
    const { data: commit } = await octokit.git.createCommit({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_FORM_REPO_NAME,
        message: `Add Candidate ${submission.candidate}`,
        tree: newTree.sha,
        parents: [ref.object.sha],
    });

    // Update branch reference
    await octokit.git.updateRef({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_FORM_REPO_NAME,
        ref: `heads/${branchName}`,
        sha: commit.sha,
    });

    context.log(`Committed files to ${branchName}`);

    // Create PR from formsubmissions fork to main repo
    // For same-org cross-repo PRs: head is bare branch name, head_repo is "owner/repo" (full path)
    const { data: pr } = await octokit.pulls.create({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        title: `Add Candidate ${submission.candidate}`,
        body: `## New Candidate Submission

**Candidate:** ${submission.candidate}
**Position:** ${submission.title}
**Party:** ${submission.party}

---

*This PR was automatically created from a form submission.*
*Correlation ID: \`${correlationId}\`*

Please verify the candidate information and merge when ready.`,
        head: branchName,
        head_repo: `${GITHUB_REPO_OWNER}/${GITHUB_FORM_REPO_NAME}`,
        base: mainRepo.default_branch,
        maintainer_can_modify: true,
    });

    context.log(`Created PR #${pr.number}: ${pr.html_url}`);

    return pr.html_url;
}

/**
 * Main HTTP trigger function for candidate submissions
 */
async function submitCandidate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Processing candidate submission request`);

    const corsHeaders = getCorsHeaders(request);

    // Handle CORS preflight — must respond before any async work
    if (request.method === "OPTIONS") {
        return { status: 204, headers: corsHeaders };
    }

    try {
        const submission = await request.json() as CandidateSubmission;

        // Validate required fields
        const errors: string[] = [];
        if (!submission.candidate) errors.push("Candidate name is required");
        if (!submission.title) errors.push("Position title is required");
        if (!submission.contactEmail) errors.push("Contact email is required");
        if (!submission.turnstileToken) errors.push("Turnstile token is required");
        if (!submission.content) errors.push("Content is required");

        if (errors.length > 0) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, message: "Validation failed", errors } as SubmissionResponse,
            };
        }

        // Verify Turnstile token
        const isValidToken = await verifyTurnstile(submission.turnstileToken);
        if (!isValidToken) {
            return {
                status: 401,
                headers: corsHeaders,
                jsonBody: { success: false, message: "Invalid security token" } as SubmissionResponse,
            };
        }

        const correlationId = randomUUID();

        let prUrl = '';
        
        if (IS_LOCAL_DEV && !GITHUB_PRIVATE_KEY_SAFE) {
            // Local dev without GitHub configured - skip PR creation
            context.log('[LOCAL_DEV] Skipping GitHub PR creation (credentials not configured)');
            prUrl = 'http://localhost:mock-pr-url';
        } else {
            // Create GitHub PR (works in local dev with real creds or production)
            const octokit = await getOctokit();
            prUrl = await createCandidatePR(octokit, submission, correlationId, context);
        }

        // Store contact info (once, with PR URL)
        const contactRecord: ContactRecord = {
            correlationId,
            submittedAt: new Date().toISOString(),
            contactEmail: submission.contactEmail,
            contactPhone: submission.contactPhone,
            contactNotes: submission.contactNotes,
            submitterName: submission.submitterName,
            submitterRelationship: submission.submitterRelationship,
            candidateName: submission.candidate,
            pullRequestUrl: prUrl,
        };

        await storeContactInfo(contactRecord);
        context.log(`Stored contact info for ${correlationId}`);

        const response: SubmissionResponse = {
            success: true,
            correlationId,
            pullRequestUrl: prUrl,
            message: "Candidate submission received! A pull request has been created for review.",
        };

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: response,
        };

    } catch (error) {
        context.error("Error processing submission:", error);

        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: {
                success: false,
                message: "An error occurred processing your submission. Please try again.",
                correlationId: "",
            } as SubmissionResponse,
        };
    }
}

// Register the function — OPTIONS is required for CORS preflight on Linux consumption plan
app.http("submitCandidate", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous",
    handler: submitCandidate,
});
