import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";

const config = new pulumi.Config();

// Configuration from Pulumi ESC
const appName = config.get("appName") || "democracycandidate";
const environmentName = config.get("environmentName") || pulumi.getStack();
const prefix = `${appName}-${environmentName}`;
const shortPrefix = `dc${environmentName}`;
const resourceGroupName = config.require("resourceGroupName");
const location = config.get("location") || "CentralUS";

// GitHub App configuration (from ESC)
const githubAppId = config.require("githubAppId");
const githubAppPrivateKey = config.requireSecret("githubAppPrivateKey");
const githubAppInstallationId = config.require("githubAppInstallationId");
const githubRepoOwner = config.get("githubRepoOwner") || "democracycandidate";
// Main repo where PRs are opened and content is published
const githubRepoName = config.get("githubRepoName") || "democracycandidate";
// Formsubmissions repo where branches are created (fork pattern)
const githubFormRepoName = config.get("githubFormRepoName") || "democracycandidate-formsubmissions";

// Turnstile configuration (from ESC)
const turnstileSecretKey = config.requireSecret("turnstileSecretKey");

// CORS configuration
const allowedOrigins = config.getObject<string[]>("allowedOrigins") || ["https://www.democracycandidate.us"];

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Storage Account for contact submissions (separate from static site storage)
// Storage account names: max 24 chars, lowercase alphanumeric only
const contactStorage = new azure.storage.StorageAccount(`${shortPrefix}contacts`, {
    resourceGroupName: resourceGroupName,
    location: location,
    kind: azure.storage.Kind.StorageV2,
    sku: {
        name: azure.storage.SkuName.Standard_LRS,
    },
    enableHttpsTrafficOnly: true,
    allowBlobPublicAccess: false,
    minimumTlsVersion: azure.storage.MinimumTlsVersion.TLS1_2,
    accessTier: azure.storage.AccessTier.Cool, // Low-cost tier for infrequent access
});

// Container for contact info submissions
const contactContainer = new azure.storage.BlobContainer(`${prefix}-contacts`, {
    resourceGroupName: resourceGroupName,
    accountName: contactStorage.name,
    publicAccess: azure.storage.PublicAccess.None,
});

// Get storage connection string for function app
const storageConnectionString = pulumi.all([contactStorage.name, resourceGroupName]).apply(([accountName, rgName]) =>
    azure.storage.listStorageAccountKeysOutput({
        resourceGroupName: rgName,
        accountName: accountName,
    }).apply(keys => {
        const primaryKey = keys.keys[0].value;
        return `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${primaryKey};EndpointSuffix=core.windows.net`;
    })
);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Azure Function App (Consumption Plan)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Consumption App Service Plan (pay-per-execution)
const plan = new azure.web.AppServicePlan(`${prefix}-plan`, {
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "FunctionApp",
    sku: {
        tier: "Dynamic",
        name: "Y1",
    },
    reserved: true, // Required for Linux
});

// Function App with Node.js 22 LTS, Functions v4 runtime
const functionApp = new azure.web.WebApp(`${prefix}-func`, {
    resourceGroupName: resourceGroupName,
    location: location,
    serverFarmId: plan.id,
    kind: "FunctionApp,Linux",
    httpsOnly: true,
    siteConfig: {
        linuxFxVersion: "Node|22",
        cors: {
            allowedOrigins: allowedOrigins,
            supportCredentials: false,
        },
        ftpsState: azure.web.FtpsState.Disabled,
        minTlsVersion: azure.web.SupportedTlsVersions.SupportedTlsVersions_1_3,
        appSettings: [
            // Azure Functions runtime settings
            { name: "FUNCTIONS_EXTENSION_VERSION", value: "~4" },
            { name: "FUNCTIONS_WORKER_RUNTIME", value: "node" },
            { name: "WEBSITE_NODE_DEFAULT_VERSION", value: "~22" },
            { name: "WEBSITE_RUN_FROM_PACKAGE", value: "1" },

            // Storage for function app internals
            { name: "AzureWebJobsStorage", value: storageConnectionString },

            // Contact storage connection
            { name: "CONTACT_STORAGE_CONNECTION", value: storageConnectionString },
            { name: "CONTACT_CONTAINER_NAME", value: contactContainer.name },

            // GitHub App authentication
            { name: "GITHUB_APP_ID", value: githubAppId },
            { name: "GITHUB_APP_PRIVATE_KEY", value: githubAppPrivateKey },
            { name: "GITHUB_APP_INSTALLATION_ID", value: githubAppInstallationId },
            { name: "GITHUB_REPO_OWNER", value: githubRepoOwner },
            { name: "GITHUB_REPO_NAME", value: githubRepoName },
            { name: "GITHUB_FORM_REPO_NAME", value: githubFormRepoName },

            // CORS allowed origins (comma-separated) — read by function code for reliable preflight handling
            { name: "ALLOWED_ORIGINS", value: allowedOrigins.join(",") },

            // Cloudflare Turnstile
            { name: "TURNSTILE_SECRET_KEY", value: turnstileSecretKey },
        ],
    },
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Exports
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export const functionAppName = functionApp.name;
export const functionAppUrl = pulumi.interpolate`https://${functionApp.defaultHostName}`;
export const contactStorageAccountName = contactStorage.name;
