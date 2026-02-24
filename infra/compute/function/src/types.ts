/**
 * Candidate Form Submission Types
 */

// Request payload from the form
export interface CandidateSubmission {
    // Hugo Frontmatter fields
    title: string;           // Office/position title
    candidate: string;       // Candidate name
    party: string;           // Party affiliation
    electionDate: string;   // ISO date (YYYY-MM-DD)
    categories: string[];    // ["School Board", "Illinois"]
    tags: string[];          // ["Lake Park", "High School"]
    about: string;           // Short bio for card display
    website?: string;        // Campaign website URL

    // Markdown body content
    content: string;         // Full markdown content (Policy, Experience, etc.)

    // Images (base64 encoded with data URI prefix or raw base64)
    titleImage?: string;     // Main/hero image
    avatarImage?: string;    // Profile photo

    // Inline images from markdown
    additionalImages?: Array<{
        path: string;       // Relative path (e.g., "images/img-xyz.jpg")
        content: string;    // Base64 content (without prefix)
    }>;

    // Private contact info (stored in blob, NOT in PR)
    contactEmail: string;
    contactPhone?: string;
    contactNotes?: string;   // Any additional contact context
    submitterName?: string;
    submitterRelationship?: string;

    // Security
    turnstileToken: string;  // Cloudflare Turnstile response token
}

// Response to the submitter
export interface SubmissionResponse {
    success: boolean;
    correlationId: string;   // UUID linking contact info to PR
    pullRequestUrl?: string; // GitHub PR URL for user to track
    message: string;
    errors?: string[];
}

// Contact info stored in blob storage
export interface ContactRecord {
    correlationId: string;
    submittedAt: string;     // ISO timestamp
    contactEmail: string;
    contactPhone?: string;
    contactNotes?: string;
    submitterName?: string;
    submitterRelationship?: string;
    candidateName: string;
    pullRequestUrl?: string;
}

// Turnstile verification response
export interface TurnstileVerifyResponse {
    success: boolean;
    challenge_ts?: string;
    hostname?: string;
    'error-codes'?: string[];
    action?: string;
    cdata?: string;
}
