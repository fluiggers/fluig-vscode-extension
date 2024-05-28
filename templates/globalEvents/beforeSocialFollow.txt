function beforeSocialFollow(companyId, follow) {
    log.info("beforeSocialFollow Social Alias: " + follow.getSocial().getAlias() + " Followed Alias: " + follow.getFollowed().getAlias());
}
