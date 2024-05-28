function afterSocialUnfollow(companyId, follow) {
    log.info("afterSocialUnfollow Social Alias: " + follow.getSocial().getAlias() + " Followed Alias: " + follow.getFollowed().getAlias());
}
