import * as pulumi from "@pulumi/pulumi";
import * as azure_native from "@pulumi/azure-native";
import { fetchCloudflareIps } from "./cloudflare"; //Replace with cloudflare.getIpRanges() if using full Cloudflare provider.
import { fetchCurrentIp } from './checkip'; //Certain functions call the storage directly.  If using a private runner, this should be replaced with your private IP range.

// Import the program's configuration settings.
const config = new pulumi.Config();
const appName = config.get("appName") || pulumi.getProject();
const environmentName = config.get("environmentName") || pulumi.getStack();
const prefix = `${appName}-${environmentName}`;
const indexDocument = config.get("indexDocument") || "index.html";
const error404Document = config.get("error404Document") || "404.html";

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// These are easily shared resources that should split into their own project/stack if you have more than one site.
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const resourceGroup = new azure_native.resources.ResourceGroup(`${prefix}-rg`, {});

// Create a blob storage account.
const account = pulumi.all([fetchCloudflareIps(), fetchCurrentIp()])
.apply(([cloudFlareIps, currentIp]) => {
    const allowedCidrs = cloudFlareIps;
    if (currentIp) {
        allowedCidrs.push(currentIp);
    }

    return new azure_native.storage.StorageAccount("democracystorage", {
        resourceGroupName: resourceGroup.name,
        kind: azure_native.storage.Kind.StorageV2,
        sku: {
            name: azure_native.storage.SkuName.Standard_LRS,
        },
        enableHttpsTrafficOnly: true,
        allowBlobPublicAccess: false,
        allowCrossTenantReplication: false,
        allowedCopyScope: azure_native.storage.AllowedCopyScope.AAD,
        minimumTlsVersion: azure_native.storage.MinimumTlsVersion.TLS1_2,
        networkRuleSet: {
            bypass: azure_native.storage.Bypass.AzureServices,
            defaultAction: azure_native.storage.DefaultAction.Deny,
            ipRules: allowedCidrs.map(ip => ({ iPAddressOrRange: ip })),
        },
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Shared end
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Configure the storage account as a website.
new azure_native.storage.StorageAccountStaticWebsite(`${prefix}-website`, {
    resourceGroupName: resourceGroup.name,
    accountName: account.name,
    indexDocument: indexDocument,
    error404Document: error404Document,
});

//Potentially, you could deploy with pulumi too using something like this.
//This has the side effect of adding every file into state, so for a static site like this that would 
// 1. Exceed 200 free IaC resources quickly
// 2. Create a lot of metadata for little benefit.  A fair pattern for other use cases though.
// 
// So with that in mind we'll just use GitHub's CI/CD for this.  
// The OIDC between Azure and GitHub that enables that is setup as part of the core-infrastructure repo.
/*
new synced_folder.AzureBlobFolder(`${prefix}-website-content`, {
    path: path,
    resourceGroupName: resourceGroup.name,
    storageAccountName: account.name,
    containerName: website.containerName,
});
*/


// Export the URLs and hostnames of the storage account and CDN.
export const storageAccountName = account.name;
export const originUrl = account.primaryEndpoints.web;
