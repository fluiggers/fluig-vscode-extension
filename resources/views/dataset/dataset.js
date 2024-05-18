(function () {
    const vscode = acquireVsCodeApi();

    const FIELDS_TO_SELECT = "#fieldsToSelect";
    const FIELDS_SELECTED = "#fieldsSelected";

    const FIELDS_TO_ORDER = "#fieldsToOrder";
    const FIELDS_ORDERED = "#fieldsOrdered";

    const MODAL = $("#modalConfigFiltro");

    let dataTable = null;
    let currentDataset = "";

    let needLoadFields = true;
    let needResetConstraints = true;

    let $loading = null;
    let $constraints = null;
    let constraintsFields = [];

    $(function () {
        $loading = $("#loading").modal({
            backdrop: "static",
            keyboard: false,
            focus: false
        }).modal("show");

        $("#consultarDataset").on("click", getResultQuery);
        $("#atualizaConsulta").on("click", getResultQuery);
        $("#addConstraint").on("click", () => addConstraints(false));

        $("#constraints").on("click", ".removeConstraint", removeConstraints);

        $constraints = $("#constraints");

        sortable(FIELDS_TO_SELECT, {
            acceptFrom: FIELDS_TO_SELECT + "," + FIELDS_SELECTED,
            hoverClass: "sortable-hover",
        });

        sortable(FIELDS_SELECTED, {
            acceptFrom: FIELDS_TO_SELECT + "," + FIELDS_SELECTED,
            hoverClass: "sortable-hover",
            itemSerializer: fieldsSelectedSerializer,
        });

        sortable(FIELDS_TO_ORDER, {
            acceptFrom: FIELDS_TO_ORDER + "," + FIELDS_ORDERED,
            hoverClass: "sortable-hover",
        });

        sortable(FIELDS_ORDERED, {
            acceptFrom: FIELDS_TO_ORDER + "," + FIELDS_ORDERED,
            hoverClass: "sortable-hover",
            maxItems: 2,
            itemSerializer: fieldsOrderedSerializer,
        });

        vscode.postMessage({
            command: 'load_datasets'
        });
    });

    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'load_datasets':
                $("#dataset").select2({
                    placeholder: "Selecione o Dataset",
                    data: message.datasets
                });
                hideLoading();
                break;

            case 'query_result':
                const queryResult = message.queryResult

                if (needLoadFields) {
                    setFields(queryResult);
                }

                if (needResetConstraints) {
                    addConstraints(true);
                }

                updateTableResult(queryResult);
                hideLoading();
                break;

            case 'error':
                hideLoading();
                break;
        }
    });

    function updateTableResult(queryResult) {
        const {columns, values} = queryResult;

        const tbResult = document.getElementById('tbResultDataset');
        const $tbResult = $(tbResult);

        if (dataTable) {
            dataTable.destroy();
            $tbResult.empty();
            dataTable = null;
        }

        tbResult.innerHTML = "";

        // Montando cabeçalho da tabela
        const header = tbResult.createTHead();
        const title = header.insertRow();

        for (let columnName of columns) {
            const column = document.createElement('th');
            column.innerHTML = columnName;
            title.appendChild(column);
        }

        // Listando os registros
        const records = tbResult.appendChild(document.createElement('tbody'));

        for(let value of values) {
            const row = records.insertRow();

            for(let columnName of columns) {
                row.insertCell().innerHTML = value[columnName];
            }
        }

        tbResult.appendChild(records);

        dataTable = $tbResult.DataTable({
            order: [],
            fixedHeader: true,
            scrollX: true,
            layout: {
                topStart: 'pageLength',
                topEnd: 'search',
                bottomStart: 'info',
                bottomEnd: 'paging',
                bottom2Start: {
                    buttons: [
                        {
                            extend: 'copyHtml5',
                            text: "Copiar",
                            title: null,
                            header: true,
                            footer: false,
                        },
                        {
                            extend: 'excelHtml5',
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

    function getExcelName() {
        return serverName + ' - ' + document.getElementById("dataset").value;
    }

    function getResultQuery() {
        const dataset = document.getElementById("dataset").value;

        if (!dataset) {
            return;
        }

        showLoading();

        if (currentDataset == "") {
            currentDataset = dataset;
            const constraints = getConstraints();
            needLoadFields = true;
            needResetConstraints = !constraints.length;

            vscode.postMessage({
                command: 'consult_dataset',
                datasetId: dataset,
                fields: [],
                constraints: constraints.length ? constraints : getConstraints(true),
                order: []
            });

            return;
        }

        if (currentDataset != dataset) {
            currentDataset = dataset;
            needLoadFields = true;
            needResetConstraints = true;
            $constraints.empty();
            resetFieldsSelect();

            vscode.postMessage({
                command: 'consult_dataset',
                datasetId: dataset,
                fields: getFields(),
                constraints: getConstraints(true),
                order: getOrders()
            });

            return;
        }

        needLoadFields = false;
        needResetConstraints = false;

        vscode.postMessage({
            command: 'consult_dataset',
            datasetId: dataset,
            fields: getFields(),
            constraints: getConstraints(),
            order: getOrders()
        });
    }

    function resetFieldsSelect() {
        $(FIELDS_TO_SELECT).empty();
        $(FIELDS_SELECTED).empty();
        $(FIELDS_TO_ORDER).empty();
        $(FIELDS_ORDERED).empty();
    }

    function reloadFieldsSelectSortable() {
        sortable(FIELDS_TO_SELECT);
        sortable(FIELDS_SELECTED);
        sortable(FIELDS_TO_ORDER);
        sortable(FIELDS_ORDERED);
    }

    function removeConstraints(ev) {
        ev.preventDefault();
        this.parentElement.parentElement.remove();
    }

    function addConstraints(isReset) {
        isReset = isReset || false;

        let constraint = $(
            '<tr>'
            + '<td>'
                + '<select class="form-control form-select" style="width: 100%" name="campo"><option value=""></option></select>'
            + '</td>'
            + '<input type="text" list="fieldsList" class="form-control" name="campo" ' + (isReset ? 'value="sqlLimit"' : '') + '></td>'
            + '<td><input type="text" class="form-control" name="valor_inicial" ' + (isReset ? 'value="100"' : '') + '></td>'
            + '<td><input type="text" class="form-control" name="valor_final" ' + (isReset ? 'value="100"' : '') + '></td>'
            + '<td>'
                + '<select class="form-control form-select" name="tipo">'
                    + '<option value="MUST">MUST</option>'
                    + '<option value="MUST_NOT">MUST NOT</option>'
                    + '<option value="SHOULD">SHOULD</option>'
                + '</select>'
            + '</td>'
            + '<td>'
                + '<select class="form-control form-select" name="like">'
                    + '<option value="false">Não</option>'
                    + '<option value="true">Sim</option>'
                + '</select>'
            + '</td>'
            + '<td class="text-center" style="vertical-align:middle"><a class="btn btn-sm btn-secondary removeConstraint" href="#">X</a></td>'
            + '</tr>'
        );

        const select = constraint.find('select:first');

        select.select2({
            placeholder: "Selecione o Campo",
            data: constraintsFields,
            tags: true,
            dropdownParent: MODAL,
        });

        if (isReset) {
            select.val("sqlLimit").trigger("change");
        }

        $constraints.append(constraint);
    }

    function getConstraints(resetItems) {
        resetItems = resetItems || false;

        // Limpa constraints para evitar erros
        if (resetItems) {
            return [{
                fieldName: "sqlLimit",
                initialValue: "100",
                finalValue: "100",
                contraintType: "MUST",
                likeSearch: "false"
            }];
        }

        const rows = $constraints.find("tr");
        const datasetConstraints = [];

        for (let row of rows) {
            const fields = $(row).find(".form-control");

            datasetConstraints.push({
                fieldName: fields[0].value,
                initialValue: fields[1].value,
                finalValue: fields[2].value,
                contraintType: fields[3].value,
                likeSearch: fields[4].value
            });
        }

        return datasetConstraints;
    }

    function getFields() {
        let items = sortable(FIELDS_SELECTED, "serialize")[0].items;
        return items.map(item => item.field);
    }

    function getOrders() {
        let items = sortable(FIELDS_ORDERED, "serialize")[0].items;
        return items.map(item => item.field);
    }

    function setFields(queryResult) {
        const {columns} = queryResult;

        constraintsFields = [];
        let fieldsToSelect = [];
        let fieldsToOrder = [];

        for (let optionName of columns) {
            constraintsFields.push({
                id: optionName,
                text: optionName
            });
            fieldsToSelect.push("<li>"+ optionName + "</li>");
            fieldsToOrder.push('<li><div class="form-check form-switch">'
                + '<input type="checkbox" class="form-check-input" id="' + optionName + '">'
                + '<label class="form-check-label" for="' + optionName + '">' + optionName + '</label>'
                + '</div></li>'
            );
        }

        constraintsFields.push({id: "sqlLimit", text: "sqlLimit"});
        constraintsFields.push({id: "tablename", text: "tablename"});

        $(FIELDS_TO_SELECT).append(fieldsToSelect);
        $(FIELDS_TO_ORDER).append(fieldsToOrder);

        reloadFieldsSelectSortable();
    }

    function fieldsSelectedSerializer(serializedItem, sortableContainer) {
        return {
            field: serializedItem.html.replace(/<[^>]+>([^>]+)<.*>/, '$1'),
        }
    }

    function fieldsOrderedSerializer(serializedItem, sortableContainer) {
        let field = serializedItem.html.replace(/.*<label[^>]+>([^>]+)<.*>.*/, '$1');
        let checkbox = document.getElementById(field);

        if (checkbox && checkbox.checked) {
            field += ";desc";
        }

        return {
            field,
        }
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
