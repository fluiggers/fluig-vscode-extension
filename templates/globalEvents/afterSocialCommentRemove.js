function afterSocialCommentRemove(companyId, comment) {
    log.info(comment.getUser() + " has removed the comment " + comment.getText() + " of the sociable " + comment.getSociable().getId());
}
