function beforeSocialPostEdit(companyId, vo) {
	vo.setText(vo.getText() + " \n --- Conteúdo editado ---");
}
