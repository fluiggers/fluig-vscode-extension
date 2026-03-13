(function () {
    const vscode = acquireVsCodeApi();

    $(function () {
        $("#formServer").on("submit", saveServer);
        $("#host").on("change", validateHost);
        $("#hasBrowser").on("change", function() {
            const hasBrowser = this.value === "yes";

            if (hasBrowser) {
                $("#companyId_group").show();
                $("#username_password_group").hide();
                $("#confirmExporting_group").hide();
            } else {
                $("#companyId_group").hide();
                $("#username_password_group").show();
                $("#confirmExporting_group").show();
            }

            $("#companyId").attr("required", hasBrowser);
            $("#username").attr("required", !hasBrowser);
            $("#password").attr("required", !hasBrowser);
        });
    });

    /**
     * Salva o servidor após efetuar uma conexão bem sucedida
     *
     * @param {JQuery.Event} event
     */
    function saveServer(event) {
        event.preventDefault();

        $("#btnSalvar").addClass("loading").attr("disabled", true);

        vscode.postMessage({
            id: document.getElementById("id").value,
            name: document.getElementById("name").value,
            host: document.getElementById("host").value,
            ssl: document.getElementById("ssl").value === "yes",
            port: document.getElementById("port").value,
            username: document.getElementById("username").value,
            password: document.getElementById("password").value,
            hasBrowser: document.getElementById("hasBrowser").value === "yes",
            companyId: document.getElementById("companyId").value,
            confirmExporting: document.getElementById("confirmExporting").value === "yes",
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
        $("#btnSalvar").removeClass("loading").attr("disabled", false);
    });
}());
