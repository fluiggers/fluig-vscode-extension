function beforeDocumentRemove() {

    // Exemplo implementação

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

    if (listRelated != null) {
        log.info("Os seguintes documentos estão relacionados a este documentos: ");

        for (j = 0; j < listRelated.size(); j++) {
            log.info("Nr. documento: " 	+ listRelated.get(j).getRelatedDocumentId());
        }
    }

    log.info("Assunto: " + subject);
}
