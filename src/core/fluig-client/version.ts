// Versão do Fluig pelo mesmo endpoint REST que o Fluig Studio consulta.
export const VERSION_PATH = "/ecm/api/rest/ecm/studioWorkflowRest/version";

/** Primeiro "x.y.z" do corpo; corpo HTML (página de login) não conta como versão. */
export function parseFluigVersion(body: string): string | undefined {
    const text = body.trim();
    if (text.startsWith("<")) {
        return undefined;
    }
    return /\d+\.\d+\.\d+/.exec(text)?.[0];
}

export async function fetchFluigVersion(baseUrl: string, cookies: string, fetchImpl: typeof fetch = fetch): Promise<string> {
    let response: Response;
    try {
        response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${VERSION_PATH}`, {
            headers: [["Accept", "application/json"], ["Cookie", cookies]],
            signal: AbortSignal.timeout(20_000),
        });
    } catch (error: any) {
        throw new Error(`não foi possível consultar a versão do Fluig (${error?.message ?? error})`);
    }
    if (!response.ok) {
        throw new Error(`o Fluig recusou a consulta de versão (HTTP ${response.status})`);
    }
    const version = parseFluigVersion(await response.text());
    if (!version) {
        throw new Error("o Fluig respondeu à consulta de versão sem um número de versão");
    }
    return version;
}

/** Login + consulta. O login (LoginService) não tem timeout próprio: sem este limite, um servidor travado prende a exportação. */
export async function detectFluigVersion(
    baseUrl: string,
    login: () => Promise<string>,
    timeoutMs = 20_000,
    fetchImpl: typeof fetch = fetch
): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`o login no Fluig não respondeu em ${timeoutMs / 1000} s`)), timeoutMs);
    });
    try {
        const cookies = await Promise.race([login(), timeout]);
        return await fetchFluigVersion(baseUrl, cookies, fetchImpl);
    } finally {
        clearTimeout(timer);
    }
}
