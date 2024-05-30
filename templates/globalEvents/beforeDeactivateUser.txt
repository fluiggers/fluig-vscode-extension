function beforeDeactivateUser(login) {
	// Instância um cliente da API pdo Fluig.
    // O usuário aplicativo utilizado precisa ser um administrador do Fluig
	var consumer = oauthUtil.getNewAPIConsumer(
        "e3fe3d72-bfcc-4552-8c9b-93c66531dab9",
        "6bd0591b-73d8-4a9e-a161-d54dd92d3172-5a21991e-453f-4ea1-b80c-f42d4c57759d",
        "11a419dd-0c8a-4388-bd32-d66319bd750b",
        "fd2b53a4-b43d-4118-9725-68abaa1b41a9ee584784-73b2-454b-942f-5e07ad114234"
    );

	// Verifica se o usuário que esta sendo desativado é moderador de alguma comunidade
	var moderateCommunities = [];
	var communities = JSON.parse(consumer.get("/public/social/community/listCommunities")).content;

	for (var i in communities) {
		var isModerator = JSON.parse(consumer.get("/public/social/community/isCommunityModerator/" + communities[i].alias + "/" + login)).content;

        if (isModerator) {
			moderateCommunities.push(communities[i].name);
		}
	}

	// Caso o usuário seja moderador de alguma comunidade lança uma exceção informando que
	// o usuário moderador de comunidades e não pode ser desativado
	if (moderateCommunities.length > 0) {
		throw "O usuário " + login + " não pode ser desativado por ser moderador nas comunidades: " + moderateCommunities.join(", ") + ".";
	}
}
