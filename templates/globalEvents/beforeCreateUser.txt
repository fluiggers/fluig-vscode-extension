function beforeCreateUser(user) {
	// Verifica se a senha informada atende os requisitos m
	var passwordPattern = "((?=.*\\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%]).{8,16})";

	if (!user.getPassword().matches(passwordPattern)) {
		throw "A senha do usuário não atendeu os requisitos mínimos";
	}

	// Adiciona um dado adicional ao usuário informando a sua data de criação
	var dateFormat = new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss");
	user.putData("CreationDate", dateFormat.format(new Date()));
}
