function beforeDownloadContent(documentId) {
	//Exemplo de Implementação

	var companyId = getValue("WKCompany");
	var c1 = DatasetFactory.createConstraint( "documentPK.documentId", documentId, documentId, ConstraintType.MUST);
	var c2 = DatasetFactory.createConstraint( "documentPK.companyId", companyId, companyId, ConstraintType.MUST);
	var constraints = new Array(c1, c2);
	var ds = DatasetFactory.getDataset("document", null, constraints, null);

    if (ds != null && ds.rowsCount > 0) {
		var parent = ds.getValue(0, "parentDocumentId");

        if (parent == 43) {
			throw "Download não permitido!";
		}
	}
}
