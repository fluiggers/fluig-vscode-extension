(function () {
    const vscode = acquireVsCodeApi();
    const FIELDS_TO_SELECT = "#fieldsToSelect";
    const FIELDS_SELECTED = "#fieldsSelected";

    const FIELDS_TO_ORDER = "#fieldsToOrder";
    const FIELDS_ORDERED = "#fieldsOrdered";

    let dataTable = null;
    let currentDataset = "";
    let resetItems = true;
    let FIELDS = [];
    let $loading = null;
    let $constraints = null;

    $(function () {
        $("#dataset").select2({
            placeholder: "Selecione o Dataset"
        });

        $("#consultarDataset").on("click", getResultQuery);
        $("#atualizaConsulta").on("click", getResultQuery);
        $("#addConstraint").on("click", addConstraints);

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

        $loading = $("#loading");
    });

    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'query_result':
                $loading.addClass("d-none");
                const queryResult = message.queryResult

                if (resetItems) {
                    setFields(queryResult);
                }

                updateTableResult(queryResult);
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
            dom: '<lf><rt><ip><B>',
            buttons: ['copy', 'excel'],
            scrollX: true,
        });
    }

    function getResultQuery() {
        const dataset = document.getElementById("dataset").value;

        if (!dataset) {
            return;
        }

        $loading.removeClass("d-none");

        if (currentDataset != dataset) {
            currentDataset = dataset;
            resetItems = true;
            resetConstraints();
            resetFieldsSelect();
        } else {
            resetItems = false;
        }

        vscode.postMessage({
            command: 'consult_dataset',
            datasetId: dataset,
            fields: getFields(),
            constraints: getConstraints(),
            order: getOrders()
        });
    }

    function resetConstraints() {
        $constraints.empty();
        addConstraints(true);
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

        $constraints.append(
            '<tr>'
            + '<td><input type="text" list="fieldsList" class="form-control" name="campo" ' + (isReset ? 'value="sqlLimit"' : '') + '></td>'
            + '<td><input type="text" class="form-control" name="valor_inicial" ' + (isReset ? 'value="100"' : '') + '></td>'
            + '<td><input type="text" class="form-control" name="valor_final" ' + (isReset ? 'value="100"' : '') + '></td>'
            + '<td>'
                + '<select class="form-control" name="tipo">'
                    + '<option value="1">MUST</option>'
                    + '<option value="3">MUST NOT</option>'
                    + '<option value="2">SHOULD</option>'
                + '</select>'
            + '</td>'
            + '<td>'
                + '<select class="form-control" name="like">'
                    + '<option value="NAO">Não</option>'
                    + '<option value="SIM">Sim</option>'
                + '</select>'
            + '</td>'
            + '<td class="text-center" style="vertical-align:middle"><a class="btn btn-sm btn-secondary removeConstraint" href="#">X</a></td>'
            + '</tr>'
        );
    }

    function getConstraints() {
        const rows = $constraints.find("tr");

        let datasetConstraints = [];

        for (let row of rows) {
            const fields = $(row).find(".form-control");

            datasetConstraints.push({
                fieldName: fields[0].value,
                initialValue: fields[1].value,
                finalValue: fields[2].value,
                contraintType: fields[3].value,
                likeSearch: fields[4].value == "SIM"
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

        FIELDS = columns;
        let fieldsToSelect = [];
        let fieldsToOrder = [];

        const fieldsList = $("#fieldsList");

        fieldsList.empty();

        for (let optionName of columns) {
            const option = new Option(optionName, optionName);
            fieldsList.append(option);
            fieldsToSelect.push("<li>"+ optionName + "</li>");
            fieldsToOrder.push('<li><div class="custom-control custom-switch">'
                + '<input type="checkbox" class="custom-control-input" id="' + optionName + '">'
                + '<label class="custom-control-label" for="' + optionName + '">' + optionName + '</label>'
                + '</div></li>'
            );
        }

        fieldsList.append(new Option("sqlLimit", "sqlLimit"));
        fieldsList.append(new Option("tablename", "tablename"));
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
}());
