(function () {
    const vscode = acquireVsCodeApi();
    const { buildConstraints, buildOrder } = window.DatasetConstraints;

    const OPERATORS = [
        ["eq", "é igual a"],
        ["ne", "é diferente de"],
        ["contains", "contém"],
        ["starts", "começa com"],
        ["ends", "termina com"],
        ["between", "está entre"],
    ];

    let dataTable = null;
    let currentDataset = "";
    let datasetChanged = true;
    let columns = [];
    let records = [];
    let $loading = null;

    $(function () {
        $loading = $("#loading").modal({
            backdrop: "static",
            keyboard: false,
            focus: false
        }).modal("show");

        $("#consultarDataset").on("click", getResultQuery);
        $("#limit").on("keydown", (ev) => ev.key === "Enter" && getResultQuery());
        $("#filters").on("keydown", "input", (ev) => ev.key === "Enter" && getResultQuery());
        $("#addFilter").on("click", () => addFilter());
        $("#filters").on("click", ".remove-filter", function () {
            this.closest(".filter-row").remove();
            updateFilterCount();
        });
        $("#filters").on("change", "select[name=op]", function () {
            toggleValueTo(this.closest(".filter-row"));
        });
        $("#filters").on("input", "input", updateFilterCount);

        $("#columnSearch").on("input", filterColumnList);
        $("#columnsAll").on("click", () => setAllColumns(true));
        $("#columnsNone").on("click", () => setAllColumns(false));

        $("input[name=view]").on("change", showSelectedView);
        $("#closeRecord").on("click", closeRecord);
        $("#copyRecord").on("click", () => copy(JSON.stringify($("#recordDetail").data("record"), null, 2)));
        $("#recordFields").on("click", ".copy-value", function () {
            copy(this.dataset.value);
        });
        $("#tbResultDataset").on("click", "tbody tr", function () {
            const index = dataTable ? dataTable.row(this).index() : undefined;
            if (index === undefined || !records[index]) {
                return;
            }
            $("#tbResultDataset tbody tr.selected").removeClass("selected");
            this.classList.add("selected");
            openRecord(records[index]);
        });

        vscode.postMessage({
            command: "load_datasets"
        });
    });

    window.addEventListener("message", event => {
        const message = event.data;

        switch (message.command) {
            case "load_datasets":
                $("#dataset").select2({
                    placeholder: "Selecione o Dataset",
                    data: message.datasets
                });
                hideLoading();
                break;

            case "query_result":
                if (datasetChanged) {
                    setColumns(message.queryResult.columns);
                    datasetChanged = false;
                }
                updateResult(message.queryResult);
                hideLoading();
                break;

            case "error":
                hideLoading();
                break;
        }
    });

    function getResultQuery() {
        const dataset = document.getElementById("dataset").value;

        if (!dataset) {
            return;
        }

        if (dataset !== currentDataset) {
            currentDataset = dataset;
            datasetChanged = true;
            resetQueryPanel();
        }

        showLoading();

        vscode.postMessage({
            command: "consult_dataset",
            datasetId: dataset,
            fields: datasetChanged ? [] : getFields(),
            constraints: buildConstraints(datasetChanged ? [] : getFilters(), {
                mode: $("input[name=filterMode]:checked").val(),
                limit: document.getElementById("limit").value
            }),
            order: datasetChanged ? [] : buildOrder($("#orderField").val(), $("#orderDesc").prop("checked"))
        });
    }

    function resetQueryPanel() {
        $("#filters").empty();
        $("#columns").empty();
        $("#columnsList").empty();
        $("#orderField").find("option:not(:first)").remove();
        $("#orderDesc").prop("checked", false);
        $("#columnsHint").show();
        columns = [];
        updateFilterCount();
        closeRecord();
    }

    function addFilter() {
        const row = document.createElement("div");
        row.className = "filter-row";

        const field = document.createElement("input");
        field.type = "text";
        field.name = "field";
        field.className = "form-control form-control-sm";
        field.setAttribute("list", "columnsList");
        field.placeholder = "Campo";

        const op = document.createElement("select");
        op.name = "op";
        op.className = "form-select form-select-sm";
        for (const [value, label] of OPERATORS) {
            op.add(new Option(label, value));
        }

        const value = document.createElement("input");
        value.type = "text";
        value.name = "value";
        value.className = "form-control form-control-sm";
        value.placeholder = "Valor";

        const valueTo = document.createElement("input");
        valueTo.type = "text";
        valueTo.name = "valueTo";
        valueTo.className = "form-control form-control-sm";
        valueTo.placeholder = "até";

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-sm btn-secondary remove-filter";
        remove.title = "Remover filtro";
        remove.textContent = "✕";

        row.append(field, op, value, valueTo, remove);
        document.getElementById("filters").appendChild(row);
        toggleValueTo(row);
        field.focus();
    }

    function toggleValueTo(row) {
        row.querySelector("[name=valueTo]").hidden = row.querySelector("[name=op]").value !== "between";
    }

    function getFilters() {
        return Array.from(document.querySelectorAll("#filters .filter-row")).map((row) => ({
            field: row.querySelector("[name=field]").value,
            op: row.querySelector("[name=op]").value,
            value: row.querySelector("[name=value]").value,
            valueTo: row.querySelector("[name=valueTo]").value,
        }));
    }

    function updateFilterCount() {
        const count = getFilters().filter((filter) => filter.field.trim()).length;
        document.getElementById("filterCount").textContent = count ? String(count) : "";
    }

    function setColumns(names) {
        columns = names;
        const list = document.getElementById("columns");
        const datalist = document.getElementById("columnsList");
        const order = document.getElementById("orderField");

        for (const name of names) {
            const label = document.createElement("label");
            label.className = "column-option";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;
            checkbox.value = name;
            label.append(checkbox, " ", name);
            list.appendChild(label);

            const option = document.createElement("option");
            option.value = name;
            datalist.appendChild(option);

            order.add(new Option(name, name));
        }
        $("#columnsHint").toggle(!names.length);
    }

    function getFields() {
        const checked = $("#columns input:checked").map((_, input) => input.value).get();
        // Todas marcadas = deixa o Fluig devolver todas (inclusive colunas novas).
        return checked.length === columns.length ? [] : checked;
    }

    function setAllColumns(checked) {
        $("#columns .column-option:visible input").prop("checked", checked);
    }

    function filterColumnList() {
        const term = this.value.trim().toLowerCase();
        $("#columns .column-option").each(function () {
            this.hidden = term !== "" && !this.textContent.toLowerCase().includes(term);
        });
    }

    function updateResult(queryResult) {
        records = queryResult.values;
        closeRecord();

        const limit = document.getElementById("limit").value.trim();
        document.getElementById("resultInfo").textContent =
            `${records.length} registro(s)` + (limit && Number(limit) > 0 && records.length >= Number(limit) ? ` (limite ${limit} atingido)` : "");

        document.getElementById("jsonView").textContent = JSON.stringify(records, null, 2);
        updateTableResult(queryResult);
        showSelectedView();
    }

    function updateTableResult(queryResult) {
        const resultColumns = queryResult.columns;
        const tbResult = document.getElementById("tbResultDataset");

        if (dataTable) {
            dataTable.destroy();
            dataTable = null;
        }

        tbResult.innerHTML = "";

        const title = tbResult.createTHead().insertRow();
        for (const columnName of resultColumns) {
            const column = document.createElement("th");
            column.textContent = columnName;
            title.appendChild(column);
        }

        const body = tbResult.appendChild(document.createElement("tbody"));
        for (const record of records) {
            const row = body.insertRow();
            for (const columnName of resultColumns) {
                row.insertCell().appendChild(renderValue(record[columnName]));
            }
        }

        dataTable = $(tbResult).DataTable({
            order: [],
            scrollX: true,
            scrollY: "60vh",
            scrollCollapse: true,
            layout: {
                topStart: "pageLength",
                topEnd: "search",
                bottomStart: "info",
                bottomEnd: "paging",
                bottom2Start: {
                    buttons: [
                        {
                            extend: "copyHtml5",
                            text: "Copiar",
                            title: null,
                            header: true,
                            footer: false,
                        },
                        {
                            extend: "excelHtml5",
                            text: "Exportar Excel",
                            filename() {
                                return getExcelName();
                            },
                            title() {
                                return getExcelName();
                            },
                        },
                    ],
                },
            }
        });
    }

    /** Valor como texto (nunca HTML): nulo apagado, texto longo cortado com o valor inteiro no tooltip. */
    function renderValue(value) {
        const cell = document.createElement("span");
        if (value === null || value === undefined) {
            cell.className = "null-value";
            cell.textContent = "null";
            return cell;
        }
        cell.className = "cell-value";
        cell.textContent = String(value);
        cell.title = String(value);
        return cell;
    }

    function openRecord(record) {
        const fields = document.getElementById("recordFields");
        fields.innerHTML = "";
        for (const [name, value] of Object.entries(record)) {
            const dt = document.createElement("dt");
            dt.textContent = name;

            const dd = document.createElement("dd");
            const text = renderValue(value);
            text.className = value === null || value === undefined ? "null-value" : "record-value";
            text.removeAttribute("title");
            dd.appendChild(text);

            if (value !== null && value !== undefined) {
                const copyButton = document.createElement("button");
                copyButton.type = "button";
                copyButton.className = "btn btn-sm btn-link copy-value";
                copyButton.title = "Copiar valor";
                copyButton.textContent = "copiar";
                copyButton.dataset.value = String(value);
                dd.appendChild(copyButton);
            }
            fields.append(dt, dd);
        }
        $("#recordDetail").data("record", record).prop("hidden", false);
        if (dataTable) {
            dataTable.columns.adjust();
        }
    }

    function closeRecord() {
        $("#recordDetail").prop("hidden", true).removeData("record");
        $("#tbResultDataset tbody tr.selected").removeClass("selected");
        if (dataTable) {
            dataTable.columns.adjust();
        }
    }

    function showSelectedView() {
        const json = $("input[name=view]:checked").val() === "json";
        document.getElementById("tableView").hidden = json;
        document.getElementById("jsonView").hidden = !json;
        if (!json && dataTable) {
            dataTable.columns.adjust();
        }
    }

    function copy(text) {
        navigator.clipboard.writeText(text).catch(() => vscode.postMessage({
            command: "error",
            message: "Não foi possível copiar para a área de transferência."
        }));
    }

    function getExcelName() {
        return serverName + " - " + document.getElementById("dataset").value;
    }

    function showLoading() {
        $loading.modal("show");
    }

    function hideLoading() {
        $loading.modal("hide");

        // Força fechamento da modal
        setTimeout(
            function () {
                if ($loading.hasClass("show")) {
                    $loading.modal("hide");
                }
            },
            500
        );
    }
}());
