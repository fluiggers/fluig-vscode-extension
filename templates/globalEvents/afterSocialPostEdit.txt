function afterSocialPostEdit(companyId, post) {
	log.info(post.getUser() + " editou o conteúdo post: " + post.getPostId());
	log.info(post.getText());
}
