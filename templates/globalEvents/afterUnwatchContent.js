function afterUnwatchContent(companyId, watchDTO) {
	if (watchDTO.getSocialWatchType() == "POST" && watchDTO.getNumberWatchers() < 3 ) {
		log.erro('O post "' + watchDTO.getText() + '" do autor ' + watchDTO.getPostAuthor() + ' deixou de ser polemico');
	}
}
