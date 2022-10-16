(function () {
    const vscode = acquireVsCodeApi();

    $(function () {
        $("#formServer").on("submit", saveServer);
        $("#host").on("change", validateHost);
    });

    /**
     * Salva o servidor após efetuar uma conexão bem sucedida
     *
     * @param {JQuery.Event} event
     */
    function saveServer(event) {
        event.preventDefault();

        $("#btnSalvar").addClass("loading").attr("disabled", true);

        const id = document.getElementById("id").value;
        const name = document.getElementById("name").value;
        const host  = document.getElementById("host").value;
        const ssl = document.getElementById("ssl").value == "yes";
        const port = document.getElementById("port").value;
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        const confirmExporting = document.getElementById("confirm_pass_exporting").value == "yes";

        vscode.postMessage({
            id,
            name,
            host,
            ssl,
            port,
            username,
            password,
            confirmExporting
        });
    }

    function validateHost() {
        try {
            const url = new URL(this.value);
            const isSSL = url.protocol.indexOf("https") >= 0;

            let port = url.port;

            if (!port) {
                port = isSSL ? 443 : 80;
            }

            const name = document.getElementById("name");

            if (!name.value) {
                name.value = url.hostname;
            }

            document.getElementById("host").value = url.hostname;
            document.getElementById("ssl").value = isSSL ? "yes" : "no";
            document.getElementById("port").value = port;
        } catch (error) {

        }
    }

    window.addEventListener('message', event => {
        const message = event.data;

        $("#btnSalvar").removeClass("loading").attr("disabled", false);
    });
}());
