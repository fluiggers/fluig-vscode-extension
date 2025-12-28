function afterSocialUnlike(companyId, unlike) {
	log.info(unlike.getUser() + " has unliked the " + unlike.getSociable().getUrl());
}
