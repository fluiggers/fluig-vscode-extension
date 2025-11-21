function beforeSocialLike(companyId, like) {
	if (like.getSociable().getText().toLowerCase().indexOf("#greve") > -1) {
		throw "You can not like a post that has this type of comment.";
	}
}
