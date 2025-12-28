function beforeWatchContent(companyId, watchDTO) {
    if (watchDTO.getSocialWatchType() == "DOCUMENT") {
        //var objClass = "com.totvs.technology.social.document.6";
        var objClass = watchDTO.getObjectClass();
        var patt = new RegExp(/\d+/);
        var documentId = patt.exec(objClass);
        var documentVersion = watchDTO.getObjectId();
        var doc = getValue("WKDocument");
        var company = companyId;
        var ds;

        try {
            var c1 = DatasetFactory.createConstraint("allocatedDocumentPK.companyId", company, company, ConstraintType.MUST);
            var c2 = DatasetFactory.createConstraint("allocatedDocumentPK.sourceDocument", documentId, documentId, ConstraintType.MUST);
            var c3 = DatasetFactory.createConstraint("allocatedDocumentPK.sourceVersion", documentVersion, documentVersion, ConstraintType.MUST);
            var c4 = DatasetFactory.createConstraint("active", "true", "true", ConstraintType.MUST);
            var constraints = new Array(c1, c2, c3, c4);

            ds = DatasetFactory.getDataset("allocatedDocument", null, constraints, null);
        } catch (e) {
            log.error("Erro ao tentar recuperar o documento em CheckOut: " + e.message);
        }

        if (ds != null && ds.rowsCount > 0) {
            throw "Sua solicitação de notificação foi negada, pois o documento está em checkout.";
        }
    }

}
