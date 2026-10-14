"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
    FluigSoapError,
    WORKFLOW_NAMESPACE,
    soapCall,
    soapEnvelope,
} = require("../../src/core/fluig-client/soap");

function soapResponse(status, inner) {
    return new Response(
        '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>' + inner + "</S:Body></S:Envelope>",
        { status, headers: { "Content-Type": "text/xml; charset=utf-8" } }
    );
}

function recordingFetch(response) {
    const requests = [];
    const fetchImpl = async (url, init) => {
        requests.push({ url, init, headers: new Headers(init.headers) });
        return typeof response === "function" ? response(url, init) : response;
    };
    return { fetchImpl, requests };
}

const call = (fetchImpl, overrides = {}) => soapCall({
    baseUrl: "https://fluig.example/",
    service: "WorkflowEngineService",
    namespace: WORKFLOW_NAMESPACE,
    operation: "getWorkFlowProcessVersion",
    parts: { username: "TOKEN", password: "", companyId: 1, processId: "PROC" },
    fetchImpl,
    ...overrides,
});

test("envelope RPC/literal: partes sem namespace, na ordem, com senha vazia e arrays como elementos repetidos", () => {
    const xml = soapEnvelope(WORKFLOW_NAMESPACE, "importProcess", {
        username: "TOKEN",
        password: "",
        companyId: 1,
        attachments: { item: [{ fileName: "a.ecm30.xml", principal: true }, { attach: true, fileName: "a.svg" }] },
        newProcess: false,
        ignored: undefined,
    });
    assert.equal(
        xml,
        '<?xml version="1.0" encoding="UTF-8"?>'
        + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">'
        + '<soapenv:Body><ns:importProcess xmlns:ns="http://ws.workflow.webdesk.technology.datasul.com/">'
        + "<username>TOKEN</username><password></password><companyId>1</companyId>"
        + "<attachments><item><fileName>a.ecm30.xml</fileName><principal>true</principal></item>"
        + "<item><attach>true</attach><fileName>a.svg</fileName></item></attachments>"
        + "<newProcess>false</newProcess>"
        + "</ns:importProcess></soapenv:Body></soapenv:Envelope>"
    );
});

test("envelope escapa &, < e > nos valores", () => {
    const xml = soapEnvelope(WORKFLOW_NAMESPACE, "getToken", { login: "a<b>", password: "p&ss" });
    assert.match(xml, /<login>a&lt;b&gt;<\/login><password>p&amp;ss<\/password>/);
});

test("POST no endpoint fixo /webdesk/<Serviço> com SOAPAction entre aspas", async () => {
    const { fetchImpl, requests } = recordingFetch(soapResponse(200, "<ns2:getWorkFlowProcessVersionResponse xmlns:ns2=\"x\"><result>4</result></ns2:getWorkFlowProcessVersionResponse>"));
    const result = await call(fetchImpl, { operation: "releaseProcess", soapAction: "relaseProcess" });
    assert.equal(result, "4");
    assert.equal(requests[0].url, "https://fluig.example/webdesk/WorkflowEngineService");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].headers.get("SOAPAction"), '"relaseProcess"');
    assert.equal(requests[0].headers.get("Content-Type"), "text/xml; charset=utf-8");
    assert.match(requests[0].init.body, /<ns:releaseProcess xmlns:ns=/);
});

test("resultado decodifica entidades e preserva o texto (XML do processo dentro de <result>)", async () => {
    const { fetchImpl } = recordingFetch(soapResponse(200, "<r><result>&lt;list&gt;\n  &lt;ProcessDefinition/&gt;\n&lt;/list&gt;</result></r>"));
    assert.equal(await call(fetchImpl), "<list>\n  <ProcessDefinition/>\n</list>");
});

test("resultado composto vira objeto e item sempre vira array", async () => {
    const { fetchImpl } = recordingFetch(soapResponse(200,
        "<r><result><item><processId>A</processId><active>true</active></item></result></r>"));
    assert.deepEqual(await call(fetchImpl), { item: [{ processId: "A", active: "true" }] });
});

test("resposta sem <result> devolve texto vazio", async () => {
    const { fetchImpl } = recordingFetch(soapResponse(200, "<ns2:createWorkFlowProcessVersionResponse xmlns:ns2=\"x\"/>"));
    assert.equal(await call(fetchImpl), "");
});

test("SOAP Fault vira FluigSoapError com faultstring e detail, mesmo com HTTP 500", async () => {
    const { fetchImpl } = recordingFetch(soapResponse(500,
        "<S:Fault><faultcode>S:Server</faultcode><faultstring>Processo não encontrado</faultstring>"
        + "<detail><ns2:Exception xmlns:ns2=\"x\"><message>PROC</message></ns2:Exception></detail></S:Fault>"));
    await assert.rejects(call(fetchImpl), error => {
        assert.ok(error instanceof FluigSoapError);
        assert.equal(error.message, "Processo não encontrado");
        assert.equal(error.detail, "PROC");
        assert.equal(error.status, 500);
        return true;
    });
});

test("resposta que não é SOAP (página HTML de erro) vira erro com o status HTTP", async () => {
    const { fetchImpl } = recordingFetch(new Response("<html><body>Bad Gateway</body></html>", { status: 502 }));
    await assert.rejects(call(fetchImpl), /não respondeu em SOAP \(HTTP 502\)/);
});

test("HTTP de erro sem Fault vira erro com o status", async () => {
    const { fetchImpl } = recordingFetch(soapResponse(503, "<r><result>x</result></r>"));
    await assert.rejects(call(fetchImpl), /HTTP 503/);
});

test("timeout e falha de rede viram mensagens claras", async () => {
    const timeout = async () => {
        throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    };
    await assert.rejects(call(timeout, { timeoutMs: 5000 }), /não respondeu em 5 s/);
    const offline = async () => {
        throw new TypeError("fetch failed");
    };
    await assert.rejects(call(offline), /não foi possível conectar a https:\/\/fluig\.example\/webdesk\/WorkflowEngineService \(fetch failed\)/);
});

test("redirecionamento (servidor em http que manda para https) repete o POST no novo endereço", async () => {
    const { fetchImpl, requests } = recordingFetch((url) => url.startsWith("http://")
        ? new Response(null, { status: 301, headers: { Location: "https://fluig.example/webdesk/WorkflowEngineService" } })
        : soapResponse(200, "<r><result>7</result></r>"));
    assert.equal(await call(fetchImpl, { baseUrl: "http://fluig.example" }), "7");
    assert.deepEqual(requests.map(request => [request.url, request.init.method, request.init.redirect]), [
        ["http://fluig.example/webdesk/WorkflowEngineService", "POST", "manual"],
        ["https://fluig.example/webdesk/WorkflowEngineService", "POST", "manual"],
    ]);
    assert.match(requests[1].init.body, /<ns:getWorkFlowProcessVersion /);
});
