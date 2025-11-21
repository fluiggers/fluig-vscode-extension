function afterSocialFollow(companyId, follow) {
    log.info("afterSocialFollow Social Alias: " + follow.getSocial().getAlias() + " Followed Alias: " + follow.getFollowed().getAlias());
}
