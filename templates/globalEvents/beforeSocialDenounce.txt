function beforeSocialDenounce(companyId, denounce) {
	if (denounce.getSociable().getText().toLowerCase().indexOf("#cipa") > -1) {
		throw "You cannot denounce posts about CIPA.";
	}
}
