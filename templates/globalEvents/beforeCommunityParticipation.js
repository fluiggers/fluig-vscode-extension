function beforeCommunityParticipation(companyId, relation) {
    if (relation.getCommunity().getAlias() == "economia") {
        throw "Comunidade temporariamente indisponível";
    }
    log.info("beforeCommunityParticipation Social Alias: " + relation.getSocial().getAlias() + " Community Alias: " + relation.getCommunity().getAlias());
}
