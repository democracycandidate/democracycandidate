import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { randomUUID } from "crypto";
import { CandidateSubmission, SubmissionResponse, ContactRecord, TurnstileVerifyResponse } from "../types.js";

// Environment variables
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY!;
const CONTACT_STORAGE_CONNECTION = process.env.CONTACT_STORAGE_CONNECTION!;
const CONTACT_CONTAINER_NAME = process.env.CONTACT_CONTAINER_NAME!;
const GITHUB_APP_ID = process.env.GITHUB_APP_ID!;
const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY!;
const GITHUB_APP_INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID!;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER!;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME!;           // Main repo for PRs
const GITHUB_FORM_REPO_NAME = process.env.GITHUB_FORM_REPO_NAME!; // Fork repo for branches

/**
 * Validate Cloudflare Turnstile token
 */
async function verifyTurnstile(token: string): Promise<boolean> {
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
    const auth = createAppAuth({
        appId: GITHUB_APP_ID,
        privateKey: GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"), // Handle escaped newlines
        installationId: parseInt(GITHUB_APP_INSTALLATION_ID, 10),
    });

    const { token } = await auth({ type: "installation" });
    return new Octokit({ auth: token });
}

/**
 * Generate Hugo frontmatter from submission
 */
function generateFrontmatter(submission: CandidateSubmission, avatarFilename?: string, imageFilename?: string): string {
    const slug = submission.candidate.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    return `---
title: "${submission.title}"
meta_title: "${submission.candidate} for ${submission.title}"
description: "${submission.candidate} for ${submission.title}"
candidate: "${submission.candidate}"
party: "${submission.party}"
election_date: ${submission.electionDate}T12:00:00Z
image: "${imageFilename ? `/${imageFilename}` : ""}"
categories: ${JSON.stringify(submission.categories)}
tags: ${JSON.stringify(submission.tags)}
draft: true
avatar: "${avatarFilename || ""}"
about: "${submission.about.replace(/"/g, '\\"')}"
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
    const candidatePath = `src/content/english/candidates/${slug}`;

    // Get default branch SHA from main repo
    const { data: mainRepo } = await octokit.repos.get({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
    });

    const { data: ref } = await octokit.git.getRef({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        ref: `heads/${mainRepo.default_branch}`,
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
    const files: Array<{ path: string; content: string }> = [];

    // Process avatar image
    let avatarFilename: string | undefined;
    if (submission.avatarImage) {
        avatarFilename = `${slug}-avatar.jpg`;
        const base64Data = submission.avatarImage.replace(/^data:image\/\w+;base64,/, "");
        files.push({
            path: `${candidatePath}/${avatarFilename}`,
            content: base64Data,
        });
    }

    // Process title image
    let imageFilename: string | undefined;
    if (submission.titleImage) {
        imageFilename = `${slug}-title.jpg`;
        const base64Data = submission.titleImage.replace(/^data:image\/\w+;base64,/, "");
        files.push({
            path: `${candidatePath}/${imageFilename}`,
            content: base64Data,
        });
    }

    // Generate and add index.md
    const frontmatter = generateFrontmatter(submission, avatarFilename, imageFilename);
    files.push({
        path: `${candidatePath}/index.md`,
        content: Buffer.from(frontmatter).toString("base64"),
    });

    // Create tree with all files
    const { data: baseTree } = await octokit.git.getTree({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_FORM_REPO_NAME,
        tree_sha: ref.object.sha,
    });

    const treeItems = files.map(file => ({
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        content: file.content,
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

    // Create PR from formsubmissions repo to main repo
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
        head: `${GITHUB_REPO_OWNER}:${branchName}`,
        base: mainRepo.default_branch,
    });

    context.log(`Created PR #${pr.number}: ${pr.html_url}`);

    return pr.html_url;
}

/**
 * Main HTTP trigger function for candidate submissions
 */
async function submitCandidate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Processing candidate submission request`);

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
                jsonBody: { success: false, message: "Validation failed", errors } as SubmissionResponse,
            };
        }

        // Verify Turnstile token
        const isValidToken = await verifyTurnstile(submission.turnstileToken);
        if (!isValidToken) {
            return {
                status: 401,
                jsonBody: { success: false, message: "Invalid security token" } as SubmissionResponse,
            };
        }

        const correlationId = randomUUID();

        // Store contact info
        const contactRecord: ContactRecord = {
            correlationId,
            submittedAt: new Date().toISOString(),
            contactEmail: submission.contactEmail,
            contactPhone: submission.contactPhone,
            contactNotes: submission.contactNotes,
            submitterName: submission.submitterName,
            submitterRelationship: submission.submitterRelationship,
            candidateName: submission.candidate,
            status: "pending",
        };

        await storeContactInfo(contactRecord);
        context.log(`Stored contact info for ${correlationId}`);

        // Create GitHub PR
        const octokit = await getOctokit();
        const prUrl = await createCandidatePR(octokit, submission, correlationId, context);

        // Update contact record with PR URL
        contactRecord.pullRequestUrl = prUrl;
        contactRecord.status = "pr_created";
        await storeContactInfo(contactRecord);

        const response: SubmissionResponse = {
            success: true,
            correlationId,
            pullRequestUrl: prUrl,
            message: "Candidate submission received! A pull request has been created for review.",
        };

        return {
            status: 200,
            jsonBody: response,
        };

    } catch (error) {
        context.error("Error processing submission:", error);

        return {
            status: 500,
            jsonBody: {
                success: false,
                message: "An error occurred processing your submission. Please try again.",
                correlationId: "",
            } as SubmissionResponse,
        };
    }
}

// Register the function
app.http("submitCandidate", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: submitCandidate,
});
