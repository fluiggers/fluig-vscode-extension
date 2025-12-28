function afterSocialComment(companyId, comment) {
	log.info(comment.getUser() + " has done the comment " + comment.getText());
}
