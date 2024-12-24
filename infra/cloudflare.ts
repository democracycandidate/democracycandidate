import * as axios from "axios";

// Define an async function to fetch and process the IPs
export async function fetchCloudflareIps() : Promise<string[]> {
    try {
        const response = await axios.default.get('https://www.cloudflare.com/ips-v4/');
        const ipArray = response.data.split('\n').filter((ip: string) => ip.trim() !== '');
        
        return ipArray;

    } catch (error) {
        console.error("Error fetching Cloudflare IPs:", error);
        throw error;
    }
}
