function beforeSocialCommentEdit(companyId, comment) {
    comment.setText(comment.getText() + " \n --- Comentário editado ---");
}
