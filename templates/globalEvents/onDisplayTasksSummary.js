function onDisplayTasksSummary(resumeTasks) {
    // Exemplo de implementação

    log.info("--------------------------------------");

    log.dir(resumeTasks);

    log.info("--------------------------------------");

    log.info("WKUser: " + getValue("WKUser"));
    log.info("WKUserLocale: " + getValue("WKUserLocale"));
    log.info("WKCompany: " + getValue("WKCompany"));
    log.info("taskUserId: " + getValue("taskUserId"));
    log.info("--------------------------------------");

    resumeTasks.expiredTasks = 10;
    resumeTasks.openTasks = 20;
    resumeTasks.myRequests = 30;
    resumeTasks.toApprover = 40;
    resumeTasks.myDocuments = 50;
    resumeTasks.checkout = 60;

    log.info("--------------------------------------");

    log.dir(resumeTasks);

    log.info("--------------------------------------");
}
