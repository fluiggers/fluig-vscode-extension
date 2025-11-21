function afterReleaseProcessVersion(processXML) {

	// Exemplo de como obter dados do processo

	var pdv = getValue("ProcessDefinitionVersionDto");

    var processInfo = "\n### Nova versde processo liberada: ###";
	processInfo += "\n User: " + getValue("WKUser");
	processInfo += "\n processDescription: " + pdv.getProcessDescription();
	processInfo += "\n processId: " + pdv.getProcessId();
	processInfo += "\n version: " + pdv.getVersion();

    log.info(processInfo + "\n");
}
