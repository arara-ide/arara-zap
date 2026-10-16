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

## Encerramento e autoria

- Ao concluir trabalho em uma branch temporária, valide, mescle na branch de destino e confirme o merge no remoto. Uma tarefa não está concluída com a feature isolada; se o merge estiver pendente, informe isso ao usuário.
- Após confirmar o merge, remova a branch temporária local e remota, usando `git branch -d` localmente, e atualize as referências com `git fetch --prune`. Preserve branches permanentes, de ambiente e qualquer branch com trabalho ainda não integrado. Habilite a exclusão automática após merge somente com as branches permanentes protegidas contra exclusão. Quando o plano do GitHub não permitir essa proteção, mantenha a exclusão automática desabilitada e remova manualmente apenas branches temporárias já mescladas.
- Nunca atribua autoria ou coautoria a IA em commits ou PRs: sem trailers `Co-authored-by` para assistentes/modelos/serviços e sem assinaturas de IA. Preserve autores humanos, licenças e avisos legítimos; não reescreva histórico publicado para aplicar essa regra.
- GitHub Actions somente em `main`, inclusive jobs de workflows manuais/reutilizáveis. Sem gatilhos em PRs, tags ou branches de desenvolvimento. Valide localmente antes do merge.
