function onDisplayTasks(tasks) {
    // Exemplo de implementação

    log.info("--------------------------------------");

    log.dir(tasks);

    log.info("--------------------------------------");
    log.info("WKUser: " + getValue("WKUser"));
    log.info("WKUserLocale: " + getValue("WKUserLocale"));
    log.info("WKCompany: " + getValue("WKCompany"));
    log.info("taskUserId: " + getValue("taskUserId"));
    log.info("taskType: " + getValue("taskType"));
    log.info("taskId: " + getValue("taskId"));
    log.info("filter: " + getValue("filter"));
    log.info("maxResult: " + getValue("maxResult"));
    log.info("page: " + getValue("page"));
    log.info("order: " + getValue("order"));
    log.info("offset: " + getValue("offset"));
    log.info("--------------------------------------");

    //Insere na 1ª pagina da aba Tarefas a Concluir
    if (getValue("page") == 1 && getValue("taskType") == "open") {
        var newTask = new WorkflowTasksVO();
        newTask.setCode("TOTVS");
        newTask.setUrl("http://www.totvs.com");
        newTask.setProcessDescription("Nova Tarefa");
        newTask.setRequesterName("Joda Silva");
        newTask.setStateDescription("Atividade 1");
        newTask.setColleagueName("Ana Maria");
        newTask.setStartDateProcess("07/09/2025");
        newTask.setDateExpires("07/10/2025");
        tasks.add(newTask);
    }

    log.info("--------------------------------------");
    log.dir(tasks);
    log.info("--------------------------------------");
}
