"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { VERSION_PATH, fetchFluigVersion, parseFluigVersion } = require("../../src/core/fluig-client/version");

test("extrai x.y.z dos formatos possíveis da resposta", () => {
    assert.equal(parseFluigVersion('"Fluig 1.8.2-231211"'), "1.8.2");
    assert.equal(parseFluigVersion("1.7.1 - Crystal Lake"), "1.7.1");
    assert.equal(parseFluigVersion('{"version":"1.8.1"}'), "1.8.1");
    assert.equal(parseFluigVersion("  2.0.0\n"), "2.0.0");
});

test("sem número de versão ou página HTML não vira versão", () => {
    assert.equal(parseFluigVersion(""), undefined);
    assert.equal(parseFluigVersion('"Fluig"'), undefined);
    assert.equal(parseFluigVersion('<html><script src="/portal/resources/1.8.2/app.js"></script></html>'), undefined);
});

test("consulta o endpoint do Studio com o cookie da sessão", async () => {
    const requests = [];
    const fetchImpl = async (url, init) => {
        requests.push({ url, headers: new Headers(init.headers) });
        return new Response('"Fluig 1.7.1-220908"', { status: 200 });
    };
    assert.equal(await fetchFluigVersion("https://fluig.example/", "JSESSIONID=abc", fetchImpl), "1.7.1");
    assert.equal(requests[0].url, `https://fluig.example${VERSION_PATH}`);
    assert.equal(requests[0].headers.get("Cookie"), "JSESSIONID=abc");
    assert.equal(requests[0].headers.get("Accept"), "application/json");
});

test("HTTP de erro, corpo sem versão e falha de rede viram erro com o motivo", async () => {
    const respond = (body, status) => async () => new Response(body, { status });
    await assert.rejects(fetchFluigVersion("https://f", "", respond("x", 401)), /HTTP 401/);
    await assert.rejects(fetchFluigVersion("https://f", "", respond("<html>login</html>", 200)), /sem um número de versão/);
    const offline = async () => {
        throw new TypeError("fetch failed");
    };
    await assert.rejects(fetchFluigVersion("https://f", "", offline), /fetch failed/);
});
