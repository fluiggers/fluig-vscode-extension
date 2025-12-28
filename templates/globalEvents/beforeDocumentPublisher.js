function beforeDocumentPublisher() {

	// Exemplo implementação

	var doc = getValue("WKDocument");
	var subject = getValue("WKSubject");
	var listApprover = getValue("WKListApprover");
	var listSeg = getValue("WKListSecurity");
	var listRelated = getValue("WKListRelatedDocument");
	var state = getValue("WKState");
	var user = getValue("WKUser");
	var company = getValue("WKCompany");

	log.info("Usuário Logado: " + user);
	log.info("Empresa: " + company);

	log.info("Número do documento: " + doc.getDocumentId() + " - Versão" + doc.getVersion());

	if (listApprover != null) {
		for (j = 0; j < listApprover.size(); j++) {
			if (listApprover.get(j).getColleagueId().equals("adm")) {
				throw "O usuadm npode ser aprovador de documentos";
			}
		}
	}

	if (listSeg != null) {
		for (j = 0; j < listSeg.size(); j++) {
			if (listSeg.get(j).getAttributionValue().equals("cvd")) {
				throw "O usucvd npode estar na segurande documentos";
			}
		}
	}

	if (listRelated != null) {
		log.info("Os seguintes documentos estão relacionados a este documento: ");
		for (j = 0; j < listRelated.size(); j++) {
			log.info("Nr. documento: " 	+ listRelated.get(j).getRelatedDocumentId());
		}
	}
	log.info("Assunto: " + subject);
	log.info("Estado: " + state);
}
