function beforeUpdateUser(user) {
    // Verifica se foi alterada a senha do usuário
    if (user.getPassword() != null) {
        // Caso a senha tenha sido alterada verifica se ela atende os requisitos mínimos
        var passwordPattern = "((?=.*\\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%]).{8,16})";

        if (!user.getPassword().matches(passwordPattern)) {
            throw "A senha do usuário não atendeu os requisitos mínimos"
        }
    }

    // Adiciona um dado adicional ao usuário informando a data de atualização
    var dateFormat = new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss");
    user.putData("LastUpdateDate", dateFormat.format(new Date()));
}
