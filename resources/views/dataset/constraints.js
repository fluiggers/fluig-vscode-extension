/**
 * Traduz os filtros da tela (campo, condição, valor) para as constraints do Fluig
 * (initialValue/finalValue, MUST/SHOULD/MUST_NOT, likeSearch). Roda na webview e nos testes.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.DatasetConstraints = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    const LIKE = {
        contains: (value) => `%${value}%`,
        starts: (value) => `${value}%`,
        ends: (value) => `%${value}`,
    };

    function constraint(fieldName, initialValue, finalValue, contraintType, likeSearch) {
        // "contraintType" (sic) é o nome do campo no WSDL do Fluig.
        return { fieldName, initialValue, finalValue, contraintType, likeSearch: likeSearch ? "true" : "false" };
    }

    /**
     * @param {{ field: string, op: string, value?: string, valueTo?: string }[]} filters
     * @param {{ mode?: "all" | "any", limit?: string | number }} options
     */
    function buildConstraints(filters, options) {
        const mode = (options && options.mode) === "any" ? "any" : "all";
        const positive = mode === "any" ? "SHOULD" : "MUST";
        const result = [];

        for (const filter of filters || []) {
            const field = String(filter.field || "").trim();
            if (!field) {
                continue;
            }
            const value = String(filter.value ?? "");

            if (filter.op === "ne") {
                result.push(constraint(field, value, value, "MUST_NOT", false));
            } else if (LIKE[filter.op]) {
                const pattern = LIKE[filter.op](value);
                result.push(constraint(field, pattern, pattern, positive, true));
            } else if (filter.op === "between") {
                const valueTo = String(filter.valueTo ?? "");
                result.push(constraint(field, value, valueTo === "" ? value : valueTo, positive, false));
            } else {
                result.push(constraint(field, value, value, positive, false));
            }
        }

        const limit = String((options && options.limit) ?? "").trim();
        if (/^\d+$/.test(limit) && Number(limit) > 0) {
            result.push(constraint("sqlLimit", limit, limit, "MUST", false));
        }
        return result;
    }

    /** Ordem no formato do Fluig: `campo` ou `campo;desc`. */
    function buildOrder(field, descending) {
        return field ? [descending ? `${field};desc` : field] : [];
    }

    return { buildConstraints, buildOrder };
}));
