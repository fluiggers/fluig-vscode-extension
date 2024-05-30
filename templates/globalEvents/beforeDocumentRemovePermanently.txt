function beforeDocumentRemovePermanently() {

    // Exemplo implementação

    var doc = getValue("WKDocument");
    var user = getValue("WKUser");
    var company = getValue("WKCompany");

    log.info("Usuário Logado: " + user);
    log.info("Empresa: " + company);

    log.info("Número do documento: " + doc.getDocumentId() + " - Versão" + doc.getVersion());
}
