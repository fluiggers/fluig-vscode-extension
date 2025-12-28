function beforeUnwatchContent(companyId, watchDTO) {
    if (watchDTO.getSocialWatchType() == "COMMUNITY") {
        throw "Você não pode deixar de ser notificado sobre a comunidade " + watchDTO.getDescription();
    }
}
