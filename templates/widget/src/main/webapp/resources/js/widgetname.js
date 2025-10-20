var widgetname = SuperWidget.extend({

    //variáveis da widget
    variavelNumerica: null,
    variavelCaracter: null,

    //método iniciado quando a widget é carregada
    init() {
    },

    //BIND de eventos
    bindings: {
        local: {
            'execute': ['click_executeAction']
        },
        global: {}
    },

    executeAction(htmlElement, event) {
    }
});
