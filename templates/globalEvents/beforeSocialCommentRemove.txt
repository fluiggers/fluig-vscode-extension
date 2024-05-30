function beforeSocialCommentRemove(companyId, comment) {
    if (comment.getSociable().getText().toLowerCase().indexOf("#bolaototvs") > -1) {
        throw "You cannot change your guess.";
    }
}
