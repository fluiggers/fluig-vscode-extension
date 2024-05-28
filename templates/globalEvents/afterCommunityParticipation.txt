function afterCommunityParticipation(companyId, relation) {
	log.info("afterCommunityParticipation Social Alias: " + relation.getSocial().getAlias() + " Community Alias: " + relation.getCommunity().getAlias());
}
