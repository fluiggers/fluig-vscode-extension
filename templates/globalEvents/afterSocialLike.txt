function afterSocialLike(companyId, like) {
	log.info(like.getUser() + " has liked the " + like.getSociable().getUrl());
}
