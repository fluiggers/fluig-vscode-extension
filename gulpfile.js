const { src, dest, series, parallel } = require('gulp');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const cleanCSS = require('gulp-clean-css');
const footer = require('gulp-footer');
const fs = require('fs');

const destFolder = 'dist';

function clean(cb) {
    try {
        fs.rmSync(destFolder, { recursive: true });
    } catch (err) {

    }
    cb();
}

function buildJquery(cb) {
    src('node_modules/jquery/dist/jquery.min.js')
        .pipe(dest(`${destFolder}/libs`));

    cb();
}

function buildBootstrapCss(cb) {
    src('node_modules/bootstrap/dist/css/bootstrap.min.css')
        .pipe(dest(`${destFolder}/libs`));

    cb();
}

function buildBootstrapJs(cb) {
    src('node_modules/bootstrap/dist/js/bootstrap.min.js')
        .pipe(dest(`${destFolder}/libs`));

    cb();
}

function buildSelect2Css(cb) {
    src([
        'node_modules/select2/dist/css/select2.min.css',
        'node_modules/select2-bootstrap-5-theme/dist/select2-bootstrap-5-theme.min.css',
    ])
        .pipe(concat('select2.min.css'))
        .pipe(dest(`${destFolder}/libs`));

    cb();
}

function buildSelect2Js(cb) {
    src([
        'node_modules/select2/dist/js/select2.full.min.js',
        'node_modules/select2/dist/js/i18n/pt-BR.js',
    ])
        .pipe(concat('select2.min.js'))
        .pipe(footer(`\n$.fn.select2.defaults.set("language", "pt-BR");\n`))
        .pipe(footer(`\n$(document).on('select2:open', () => document.querySelector('.select2-search__field').focus());\n`)) // Corrige bug JQuery + Select2 no foco
        .pipe(dest(`${destFolder}/libs`));

    cb();
}

function buildDatatablesCss(cb) {
    src([
        'node_modules/datatables.net-bs5/css/dataTables.bootstrap5.min.css',
        'node_modules/datatables.net-buttons-bs5/css/buttons.bootstrap5.min.css',
        'node_modules/datatables.net-fixedheader-bs5/css/fixedHeader.bootstrap5.min.css',
        'node_modules/datatables.net-scroller-bs5/css/scroller.bootstrap5.min.css',
    ])
        .pipe(concat('datatables.min.css'))
        .pipe(dest(`${destFolder}/libs`));

    cb();
}

function buildDatatablesJs(cb) {
    let ptBrJson = JSON.stringify(JSON.parse(fs.readFileSync('node_modules/datatables.net-plugins/i18n/pt-BR.json').toString()));

    src([
        'node_modules/jszip/dist/jszip.min.js',
        'node_modules/datatables.net/js/jquery.dataTables.min.js',
        'node_modules/datatables.net-bs5/js/dataTables.bootstrap5.min.js',
        'node_modules/datatables.net-buttons/js/dataTables.buttons.min.js',
        'node_modules/datatables.net-buttons/js/buttons.html5.min.js',
        'node_modules/datatables.net-buttons-bs5/js/buttons.bootstrap5.min.js',
        'node_modules/datatables.net-fixedheader/js/dataTables.fixedHeader.min.js',
        'node_modules/datatables.net-fixedheader-bs5/js/fixedHeader.bootstrap5.min.js',
        'node_modules/datatables.net-scroller/js/dataTables.scroller.min.js',
        'node_modules/datatables.net-scroller-bs5/js/scroller.bootstrap5.min.js',
    ])
        .pipe(concat('datatables.min.js'))
        .pipe(footer(`\n$.extend($.fn.dataTable.defaults, {language: ${ptBrJson}});\n`))
        .pipe(dest(`${destFolder}/libs`));

    cb();
}

function buildHtml5Sortable(cb) {
    src('node_modules/html5sortable/dist/html5sortable.min.js')
        .pipe(dest(`${destFolder}/libs`));

    cb();
}

function buildResourcesCss(cb) {
    src('resources/**/*.css')
        .pipe(cleanCSS())
        .pipe(dest(destFolder));

    cb();
}

function buildResourcesJs(cb) {
    src('resources/**/*.js')
        .pipe(uglify())
        .pipe(dest(destFolder));

    cb();
}

function buildResourcesHtml(cb) {
    src('resources/**/*.html')
        .pipe(dest(destFolder));

    cb();
}

function buildResourcesImages(cb) {
    src('resources/images/**/*.{jpg,jpeg,png,svg}')
        .pipe(dest('dist/images'));

    cb();
}

exports.default = series(
    clean,
    parallel(
        buildJquery,
        buildBootstrapCss,
        buildBootstrapJs,
        buildSelect2Css,
        buildSelect2Js,
        buildHtml5Sortable,
        buildDatatablesCss,
        buildDatatablesJs,
        buildResourcesJs,
        buildResourcesCss,
        buildResourcesImages,
        buildResourcesHtml
    )
);

exports.clean = clean;

exports.buildLibrarys = parallel([
    buildJquery,
    buildBootstrapCss,
    buildBootstrapJs,
    buildSelect2Css,
    buildSelect2Js,
    buildHtml5Sortable,
    buildDatatablesCss,
    buildDatatablesJs,
]);

exports.buildResources = parallel([
    buildResourcesJs,
    buildResourcesCss,
    buildResourcesImages,
    buildResourcesHtml,
]);

exports.resourcesJs = buildResourcesJs;
exports.resourcesCss = buildResourcesCss;
exports.resourcesImages = buildResourcesImages;
exports.resourcesHtml = buildResourcesHtml;
