import * as axios from "axios";
import { Address4, Address6 } from 'ip-address';

export async function fetchCurrentIp() : Promise<string> {
    try {
        const response = await axios.default.get<string>('https://checkip.amazonaws.com/');
        const ip = response.data.trim();
        if (Address4.isValid(ip)) {
            return ip;
        }else{
            console.warn('IP returned was not a valid IPv4 address.  Any access errors are likely firewall related.');
            return '';
        }
    } catch (error) {
        console.error('Error fetching IP address:', error);
        throw error;
    }
}
