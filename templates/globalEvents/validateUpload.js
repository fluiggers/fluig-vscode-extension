function validateUpload() {
    // Exemplo de implementação

    // CompanyId da empresa
    var companyId = getValue("WKCompany");

    // Nome do arquivo com extensão
    var fileName = getValue("WKFileName");

    // Tamanho do arquivo em bytes
    var fileSize = getValue("WKFileSize");

    // Caminho absoluto do arquivo
    var filePath = getValue("WKFilePath");

    // MimeType dos bytes do arquivo, ou seja, independente da extensão
    var fileMimeType = getValue("WKFileMimeType");

    // UserId do usuário que estrealizando o upload
    var userId = getValue("WKUser");

    // A maioria dos mimetypes executáveis começam com "application/x-"
    if (fileMimeType.indexOf("application/x-") !== -1) {

        // Porém alguns tipos comçam também como por exemplo: .rar ou .7zip. Então neste caso pode ser feito assim:
        if (fileMimeType.indexOf("application/x-rar-compressed") !== -1 || fileMimeType.indexOf("application/x-7z-compressed") !== -1) {
            return;
        }

        throwsIfBlocked();
    }

    // Podemos bloquear qualquer outro mimetype, por exemplo:
    if (fileMimeType.indexOf("application/octet-stream") !== -1 || fileMimeType.indexOf("application/exe") !== -1) {
        throwsIfBlocked();
    }

    // Podemos bloquear também pela extensão do arquivo
    if (fileName.match(/.*\.(sh|exe|msi|bat|app)/i)) {
        throwsIfBlocked();
    }

    // Função usada para logar uma mensagem no log do servidor e retornar o erro na tela
    function throwsIfBlocked() {
        log.warn("Usuário '" + userId + "' da Empresa: '" + companyId + "' tentou realizar o upload "
            + "do Arquivo '" + fileName + "' com o Mimetype: '" + fileMimeType + "' e foi impedido!");

        throw "Este formato de documento não está de acordo com as políticas de segurança e portanto não será permitida sua publicação na plataforma.";
    }
}
