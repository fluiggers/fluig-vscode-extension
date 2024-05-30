function beforeSocialComment(companyId, comment) {
    if (comment.getSociable().getNumberLikes() < 1) {
        throw "You can not comment a post that was not liked.";
    }
}
