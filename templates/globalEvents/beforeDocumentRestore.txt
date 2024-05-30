function beforeDocumentRestore() {

    //Exemplo implementa

    var doc = getValue("WKDocument");
    var subject = getValue("WKSubject");
    var listApprover = getValue("WKListApprover");
    var listSeg = getValue("WKListSecurity");
    var listRelated = getValue("WKListRelatedDocument");
    var user = getValue("WKUser");
    var company = getValue("WKCompany");

    log.info("Usuário Logado: " + user);
    log.info("Empresa: " + company);

    log.info("Número do documento: " + doc.getDocumentId() + " - Versão" + doc.getVersion());

    log.info("Assunto: " + subject);
}
