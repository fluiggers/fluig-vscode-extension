import { window, workspace, ConfigurationTarget } from "vscode";
import { Client, createClientAsync, IOptions } from 'soap';
import { ServerDTO } from '../models/ServerDTO';
import { UtilsService } from './UtilsService';
import * as puppeteer from 'puppeteer-core';

export class LoginService {

    private static cachedCookies : {[key: string]: string} = {};

    public static async loginAndGetCookies(server: ServerDTO) : Promise<string> {
        const cookiesKey = this.getCookiesKey(server);
        let cookies = this.cachedCookies[cookiesKey];

        if (cookies) {
            if (await this.isValidCookies(cookies, server)) {
                return cookies;
            }

            delete this.cachedCookies[cookiesKey];
        }

        cookies = server.hasBrowser ? await this.tryBrowserAuthenticate(server) : await this.tryAuthenticate(server);

    	if (this.isAuthenticated(cookies) && !await this.isValidCookies(cookies, server)) {
			await this.setDemoMode(server);

			cookies = server.hasBrowser ? await this.tryBrowserAuthenticate(server) : await this.tryAuthenticate(server);
    	}

        this.cachedCookies[cookiesKey] = cookies;

        return cookies;
    }

    public static async createAuthenticatedClientAsync(server: ServerDTO, uri: string, options?: IOptions) : Promise<Client> {
        const cookies = await LoginService.loginAndGetCookies(server);

        const client: any = await createClientAsync(uri, options);
        if (cookies) {
            client.addHttpHeader("Cookie", cookies);
        }

        return client;
    }

    public static clearCookies(server: ServerDTO) {
        delete this.cachedCookies[this.getCookiesKey(server)];
    }

    private static getCookiesKey(server: ServerDTO) {
        let cookiesKey = String(server.hasBrowser) + server.host + server.port;

        if (server.hasBrowser) {
            cookiesKey += server.companyId;
        } else {
            cookiesKey += server.username;
        }
        return cookiesKey;
    }

    private static isAuthenticated(cookies: string) {
        return cookies.includes("JSESSIONIDSSO") || cookies.includes("jwt.token");
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
            if (body.startsWith("{") && body.includes("pong")) {
                return true;
            }
        }

        return false;
    }

    private static async setDemoMode(server: ServerDTO) {
        const pingUrl = `${UtilsService.getHost(server)}/portal/api/servlet/license.do?demo=true`;

        await fetch(pingUrl, {
            method: 'POST'
        });
    }

    private static async tryAuthenticate(server: ServerDTO) {
        const loginUrl = `${UtilsService.getHost(server)}/portal/api/servlet/login.do`;
        const loginData = `j_username=${server.username}&j_password=${server.password}`;

        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: loginData
        });

        return (response.headers.get('set-cookie') || '')
            .split(',')
            .map(cookie => cookie.split(';')[0])
            .join('; ');
    }

    private static async tryBrowserAuthenticate(server: ServerDTO) {
        let browser: puppeteer.Browser|null = null;

        const config = workspace.getConfiguration('fluiggers');
        let customPath = config.get<string>('browserPath', "");

        if (!customPath.length) {
            const fileUri = await window.showOpenDialog({
                canSelectMany: false,
                title: "Selecione o executável do seu navegador para efetuar o Login",
                openLabel: 'Selecionar',
                filters: {
                    'Executables': ['exe', 'app', 'bin', 'sh']
                }
            });

            if (fileUri && fileUri[0]) {
                customPath = fileUri[0].fsPath;
                await config.update('browserPath', customPath, ConfigurationTarget.Global);
            } else {
                window.showErrorMessage("Preencha o caminho até o seu navegador nas configurações da Extensão Fluiggers!");
                return "";
            }
        }

        try {
            browser = await puppeteer.launch({
                headless: false,
                executablePath: customPath,
                browser: /firefox/i.test(customPath) ? "firefox" : "chrome",
            });

            const pages = await browser.pages();
            const page = pages[0];
            const viewport = page.viewport();

            if (viewport) {
                await page.setViewport({width: viewport.width, height: viewport.height});
            }

            await page.goto(`${UtilsService.getHost(server)}/portal/p/${server.companyId}/home`);

            // Monitora os cookies a cada intervalo
            const cookiesPromise = new Promise<string>((resolve, reject) => {
                // watch for the login or page being closed
                const checkCookie = setInterval(async () => {
                    try {
                        if (!browser) {
                            throw new Error("Não foi possível carregar o navegador");
                        }

                        const cookies = await browser.cookies();
                        const sessionCookie = cookies.find(c => c.name === 'JSESSIONIDSSO' || c.name === 'jwt.token');

                        if (sessionCookie) {
                            clearInterval(checkCookie);
                            clearTimeout(timeout);

                            // Formata os cookies no mesmo padrão que o fetch retornava
                            const cookieString = cookies
                                .map(c => `${c.name}=${c.value}`)
                                .join('; ');

                            resolve(cookieString);
                        }
                    } catch (e) {
                        // in case the page is already closed and cookies() throws
                        clearInterval(checkCookie);
                        clearTimeout(timeout);
                        reject();
                    }
                }, 1000);

                // reject if the user closes the page manually
                page.once('close', () => {
                    clearInterval(checkCookie);
                    clearTimeout(timeout);
                    reject();
                });

                // add a generous timeout so we don't hang forever
                const timeout = setTimeout(() => {
                    clearInterval(checkCookie);
                    reject();
                }, 5 * 60 * 1000); // 5 minutes
            });

            const cookies = await cookiesPromise;
            await browser.close();
            return cookies;
        } catch (ignored) {
            if (browser) {
                await browser.close();
            }
        }

        return "";
    }
}
