function afterWatchContent(companyId, watchDTO) {
	if (watchDTO.getSocialWatchType() == "POST") {
		log.info( "O usuário " + watchDTO.getUserAlias() + " vai ser notificado sobre o post " + watchDTO.getText() + " do autor " + watchDTO.getPostAuthor());
	}
}
