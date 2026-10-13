// Cliente SOAP mínimo para os serviços de processo do Fluig (SOAP 1.1, RPC/literal).
// O POST vai direto em {baseUrl}/webdesk/<Serviço>, sem ler o WSDL: atrás de proxy reverso ou de
// SSL terminado, o soap:address do WSDL costuma apontar para o host interno.
const sax = require("sax");

export const TOKEN_NAMESPACE = "http://ws.dm.webdesk.technology.datasul.com/";
export const WORKFLOW_NAMESPACE = "http://ws.workflow.webdesk.technology.datasul.com/";
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Parte de uma chamada: objetos viram elementos aninhados; arrays repetem o elemento; null/undefined é omitido. */
export type SoapValue = string | number | boolean | null | undefined | SoapValue[] | { [name: string]: SoapValue };

/** Resposta convertida: folha = texto; elemento composto = objeto; `item` repetido = array. */
export type SoapResult = string | SoapResult[] | { [name: string]: SoapResult };

export class FluigSoapError extends Error {
    constructor(message: string, readonly status: number, readonly detail = "") {
        super(message);
        this.name = "FluigSoapError";
    }
}

export interface SoapCallOptions {
    baseUrl: string;
    service: string;
    namespace: string;
    operation: string;
    /** Padrão: o nome da operação. */
    soapAction?: string;
    parts: { [name: string]: SoapValue };
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

interface XmlNode {
    name: string;
    children: XmlNode[];
    text: string;
}

function escapeXml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serialize(name: string, value: SoapValue): string {
    if (value === null || value === undefined) {
        return "";
    }
    if (Array.isArray(value)) {
        return value.map(item => serialize(name, item)).join("");
    }
    if (typeof value === "object") {
        const children = Object.keys(value).map(child => serialize(child, value[child])).join("");
        return `<${name}>${children}</${name}>`;
    }
    return `<${name}>${escapeXml(String(value))}</${name}>`;
}

/** Partes sem namespace, na ordem das chaves (RPC/literal). */
export function soapEnvelope(namespace: string, operation: string, parts: { [name: string]: SoapValue }): string {
    const body = Object.keys(parts).map(name => serialize(name, parts[name])).join("");
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">'
        + `<soapenv:Body><ns:${operation} xmlns:ns="${namespace}">${body}</ns:${operation}></soapenv:Body>`
        + "</soapenv:Envelope>";
}

function findNode(node: XmlNode, name: string): XmlNode | undefined {
    for (const child of node.children) {
        const found = child.name === name ? child : findNode(child, name);
        if (found) {
            return found;
        }
    }
    return undefined;
}

function allText(node: XmlNode): string {
    return [node.text, ...node.children.map(allText)].join(" ").replace(/\s+/g, " ").trim();
}

function toResult(node: XmlNode): SoapResult {
    if (!node.children.length) {
        return node.text;
    }
    const value: { [name: string]: SoapResult } = {};
    for (const child of node.children) {
        const item = toResult(child);
        const previous = value[child.name];
        if (previous === undefined) {
            value[child.name] = child.name === "item" ? [item] : item;
        } else if (Array.isArray(previous)) {
            previous.push(item);
        } else {
            value[child.name] = [previous, item];
        }
    }
    return value;
}

/** Primeiro filho do Body (resposta ou Fault), sem prefixos de namespace. Lança se o XML for inválido. */
function parseSoapBody(xml: string): XmlNode {
    const root: XmlNode = { name: "", children: [], text: "" };
    const stack: XmlNode[] = [root];
    const parser = sax.parser(true, { trim: false, normalize: false });
    parser.onopentag = (tag: { name: string }) => {
        const node: XmlNode = { name: tag.name.replace(/^.*:/, ""), children: [], text: "" };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
    };
    parser.onclosetag = () => {
        stack.pop();
    };
    parser.ontext = parser.oncdata = (text: string) => {
        stack[stack.length - 1].text += text;
    };
    parser.write(xml).close();
    const first = findNode(root, "Body")?.children[0];
    if (!first) {
        throw new Error("Resposta SOAP sem Body.");
    }
    return first;
}

export async function soapCall(options: SoapCallOptions): Promise<SoapResult> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const url = `${options.baseUrl.replace(/\/+$/, "")}/webdesk/${options.service}`;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const init: RequestInit = {
        method: "POST",
        headers: [
            ["Content-Type", "text/xml; charset=utf-8"],
            ["SOAPAction", `"${options.soapAction ?? options.operation}"`],
        ],
        body: soapEnvelope(options.namespace, options.operation, options.parts),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "manual",
    };
    let response: Response;
    try {
        response = await fetchImpl(url, init);
        // Servidor cadastrado em http e redirecionado para https: o redirect automático trocaria o POST por GET.
        const location = response.headers.get("location");
        if (response.status >= 300 && response.status < 400 && location) {
            response = await fetchImpl(new URL(location, url).toString(), init);
        }
    } catch (error: any) {
        if (error?.name === "TimeoutError") {
            throw new FluigSoapError(`${options.operation}: o Fluig não respondeu em ${timeoutMs / 1000} s.`, 0);
        }
        throw new FluigSoapError(`${options.operation}: não foi possível conectar a ${url} (${error?.message ?? error}).`, 0);
    }

    const text = await response.text();
    let body: XmlNode;
    try {
        body = parseSoapBody(text);
    } catch (_error) {
        throw new FluigSoapError(`${options.operation}: o Fluig não respondeu em SOAP (HTTP ${response.status}).`, response.status);
    }
    if (body.name === "Fault") {
        const faultString = findNode(body, "faultstring");
        const detail = findNode(body, "detail");
        throw new FluigSoapError(
            faultString ? allText(faultString) : `${options.operation}: o Fluig recusou a operação.`,
            response.status,
            detail ? allText(detail) : ""
        );
    }
    if (!response.ok) {
        throw new FluigSoapError(`${options.operation}: HTTP ${response.status}.`, response.status);
    }
    return toResult(body.children.find(child => child.name === "result") ?? body);
}
