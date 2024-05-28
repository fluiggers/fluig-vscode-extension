function afterSocialPostRemove(companyId, post) {
	log.info(post.getUser() + " has removed the post " + post.getPostId());
}
