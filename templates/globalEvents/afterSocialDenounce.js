function afterSocialDenounce(companyId, denounce) {
    log.info(denounce.getUser() + " has denounced the sociable " + denounce.getSociable().getId() + " with comment " + denounce.getText());
}
