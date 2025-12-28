function beforeSocialPostRemove(companyId, post) {
    if (post.getText().toLowerCase().indexOf("#important") > -1) {
        throw "You cannot remove a post marked as important.";
    }
}
