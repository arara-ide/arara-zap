# AGENTS.md — Arara Zap

## Fluxo de branches

Por orientação explícita do usuário em 16/10/2026, este repositório segue a seção **Branches e contribuição** do README. Esta regra substitui a orientação geral antiga de desenvolver somente na `main`.

- `main`: linha estável e padrão do GitHub; promoção por PR.
- `development`: trabalho diário e checkout do notebook.
- `feature/*` e `fix/*`: saem de `development` e voltam para ela.
- `release/*`: preparação opcional, de `development` para `main`.
- `hotfix/*`: sai de `main` e deve ser incorporada em `main` e `development`.
- Não publicar a partir de branches de desenvolvimento, apagar branches históricas sem verificar seus commits ou reescrever o histórico.
- Commit e push continuam dependendo de autorização do usuário. Esta política não altera os fluxos dos repositórios `ac-*`.
