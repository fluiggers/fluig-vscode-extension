function beforeDocumentViewer() {

	// Exemplo implementação

	var doc = getValue("WKDocument");
	var company = getValue("WKCompany");
	var ds

	try {
		var c1 = DatasetFactory.createConstraint( "allocatedDocumentPK.companyId", company, company, ConstraintType.MUST);
		var c2 = DatasetFactory.createConstraint("allocatedDocumentPK.sourceDocument", doc.getDocumentId(), doc.getDocumentId(), ConstraintType.MUST);
		var c3 = DatasetFactory.createConstraint("allocatedDocumentPK.sourceVersion", doc.getVersion(),doc.getVersion(), ConstraintType.MUST);
		var c4 = DatasetFactory.createConstraint("active", "true","true",ConstraintType.MUST);
		var constraints = new Array(c1, c2, c3, c4);

		ds = DatasetFactory.getDataset("allocatedDocument", null, constraints, null);
	} catch (e) {
		log.error("Erro ao tentar recuperar o documento em CheckOut: " + e.message);
	}

	if (ds!=null && ds.rowsCount>0) {
        throw  "Este documento estem Check-out e não pode ser visualizado. "
            + "Foi gerado o documento " + ds.getValue(0,"allocatedDocumentPK.destinationDocument")
            + " que está sob responsabilidade do colaborador com matrícula "+ ds.getValue(0,"colleagueId")
        ;
	}
}
