# Dependencias Fluig Studio do gerador ECM30

Esta pasta e preenchida no build de distribuicao por
`scripts/prepare-fluig-runtime.js`.

O VSIX recebe somente os JARs usados pelo conversor do Fluig Studio em
`runtime/fluig-studio/plugins`. Nenhum JRE ou JDK portatil e empacotado.

O Java e resolvido em tempo de execucao, nesta ordem:

1. configuracao global `fluiggers.javaPath` (executavel ou pasta JAVA_HOME);
2. variavel de ambiente `JAVA_HOME`;
3. comando `java` disponivel no `PATH`.

Essa estrategia usa o Java 8 ou superior instalado pelo usuario e funciona no
Windows, Linux e macOS.

Os JARs TOTVS sao copiados de uma instalacao local do Fluig Studio. Confirme
que a licenca contratada permite redistribui-los antes de compartilhar o VSIX.
