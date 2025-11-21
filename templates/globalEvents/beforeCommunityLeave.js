function beforeCommunityLeave(companyId, relation) {
    if (relation.getCommunity().getAlias() == "eventos") {
        throw "Não é permitido deixar essa comunidade";
    }
    log.info("beforeCommunityLeave Social Alias: " + relation.getSocial().getAlias() + " Community Alias: " + relation.getCommunity().getAlias());
}
