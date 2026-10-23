'use strict';

/**
 * `.project` igual ao que o Fluig Studio cria (natures JavaScript e TOTVS ECM Designer).
 * @param {string} name código do projeto, já validado
 */
function studioProjectFile(name) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<projectDescription>',
        `\t<name>${name}</name>`,
        '\t<comment></comment>',
        '\t<projects>',
        '\t</projects>',
        '\t<buildSpec>',
        '\t\t<buildCommand>',
        '\t\t\t<name>org.eclipse.wst.validation.validationbuilder</name>',
        '\t\t\t<arguments>',
        '\t\t\t</arguments>',
        '\t\t</buildCommand>',
        '\t</buildSpec>',
        '\t<natures>',
        '\t\t<nature>org.eclipse.wst.jsdt.core.jsNature</nature>',
        '\t\t<nature>com.totvs.tds.ecm.designer.nature</nature>',
        '\t</natures>',
        '</projectDescription>',
        ''
    ].join('\n');
}

/**
 * Pastas e arquivos de um projeto Fluig novo, relativos à pasta do projeto. Pastas terminam em `/`;
 * arquivos trazem `content`.
 * @param {string} name código do projeto, já validado
 * @param {{ processText: string, literals: Map<string, string>, formHtml: string }} parts
 * @returns {{ path: string, content?: string }[]}
 */
function fluigProjectEntries(name, { processText, literals, formHtml }) {
    const form = `form_${name}`;
    return [
        { path: '.project', content: studioProjectFile(name) },
        { path: 'datasets/' },
        { path: 'events/' },
        { path: 'mechanisms/' },
        { path: 'wcm/widget/' },
        { path: `forms/${form}/${form}.html`, content: formHtml },
        { path: `forms/${form}/events/` },
        { path: `workflow/diagrams/${name}.process`, content: processText },
        ...[...literals].map(([locale, content]) => ({ path: `workflow/literals/${name}_${locale}.properties`, content })),
        { path: 'workflow/scripts/' }
    ];
}

module.exports = { fluigProjectEntries };
