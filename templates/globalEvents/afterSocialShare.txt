function afterSocialShare(companyId, share) {
	log.info(share.getUser() + " has shared the sociable " + share.getSociable().getId() + " with text " + share.getText());
}
