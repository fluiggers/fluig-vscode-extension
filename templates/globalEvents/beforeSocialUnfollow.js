function beforeSocialUnfollow(companyId, follow) {
    log.info("beforeSocialUnfollow Social Alias: " + follow.getSocial().getAlias() + " Followed Alias: " + follow.getFollowed().getAlias());
}
