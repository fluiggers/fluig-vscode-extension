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
