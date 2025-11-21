function beforeSocialPost(companyId, vo) {
    if (vo.getText().indexOf(" fluid ") > -1) {
        vo.setText(vo.getText().replace(" fluid ", " fluig "));
    }
}
