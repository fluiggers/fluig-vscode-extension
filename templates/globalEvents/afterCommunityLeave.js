function afterCommunityLeave(companyId, relation) {
    log.info("afterCommunityLeave Social Alias: " + relation.getSocial().getAlias() + " Community Alias: " + relation.getCommunity().getAlias());
}
