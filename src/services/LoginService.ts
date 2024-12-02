import { ServerDTO } from '../models/ServerDTO';
import { UtilsService } from './UtilsService';

export class LoginService {
   
    private static cachedCookies : any = {};

    public static async loginAndGetCookies(server: ServerDTO) : Promise<string> {
        const cookiesKey = server.host + server.port + server.username + server.password;
        let cookies = this.cachedCookies[cookiesKey];

        if (cookies) {
            if (await this.isValidCookies(cookies, server)) {
                return cookies;
            }

            delete this.cachedCookies[cookiesKey];
        }

        const loginUrl = `${UtilsService.getHost(server)}/portal/api/servlet/login.do`;
        const loginData = `j_username=${server.username}&j_password=${server.password}`;

        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: loginData
        });

        cookies = (response.headers.get('set-cookie') || '')
            .split(',')
            .map(cookie => cookie.split(';')[0])
            .join('; ');

        this.cachedCookies[cookiesKey] = cookies;

        return cookies;
    }

    private static async isValidCookies(cookiesCached: string, server: ServerDTO) : Promise<boolean> {
        const pingUrl = `${UtilsService.getHost(server)}/portal/p/api/servlet/ping`;

        const response = await fetch(pingUrl, {
            method: 'POST', 
            headers: {
                'Cookie': cookiesCached
            }
        });

        if (response.ok) {
            const body = await response.text();
            if (body.includes('pong')) {
                return true;
            }
        }

        return false;
    }
}
