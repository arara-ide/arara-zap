# Arara Zap

Conecta o WhatsApp ao Arara Code diretamente por WebSocket. Node simples, sem API REST, painel web, banco externo ou relay no ac-services. Envie `arara` (sem distinguir maiúsculas) no WhatsApp para escolher projeto, assistente, modelo, esforço, aprovar ações e acompanhar respostas. A IDE precisa continuar aberta e o projeto precisa ser confiável.

Base de conexão: [Baileys](https://github.com/WhiskeySockets/Baileys), também usado no wa-dialogue. Implementação independente, licença MIT. Integração não oficial do WhatsApp; compatibilidade depende do serviço e do Baileys.

## Branches e contribuição

A branch estável e padrão é `main`, seguindo a nomenclatura atual do GitHub. O trabalho diário fica em `development`; este é o checkout recomendado no notebook. Branches representam etapas do código, e não ambientes de execução.

| Branch | Origem | Uso e destino |
|---|---|---|
| `main` | — | Código aprovado para distribuição; recebe PRs de `development`, `release/*` ou `hotfix/*`. |
| `development` | `main` | Integração contínua e trabalho diário; recebe funcionalidades e correções. |
| `feature/<assunto>` | `development` | Funcionalidade isolada; PR para `development`. |
| `fix/<assunto>` | `development` | Correção comum; PR para `development`. |
| `release/<versao>` | `development` | Preparação opcional de versão; PR para `main`, seguido de sincronização com `development`. |
| `hotfix/<assunto>` | `main` | Correção urgente de uma versão distribuída; PR para `main` e incorporação também em `development`. |

Somente `main` e `development` são permanentes. Crie as demais quando houver trabalho concreto e remova-as após integrar seus commits. Branches anteriores à adoção deste fluxo são históricas: confira os commits antes de integrar ou excluir.

Para trabalhar no notebook:

```sh
git switch development
git pull --ff-only origin development
# Opcional, para isolar uma tarefa:
git switch -c feature/nome-da-tarefa
```

Trabalho individual pode ser commitado diretamente em `development`. Use Conventional Commits e PRs para promover código a `main`. Após uma promoção ou hotfix, incorpore `main` em `development` por merge, preservando o histórico; não use force push nem mova tags publicadas.

As GitHub Actions executam somente em `main`, para validar e distribuir releases. Não há gatilhos de Actions em `development`, branches temporárias, PRs ou tags. Faça a validação local antes do merge; execuções manuais também têm os jobs restritos a `main`. As convenções de PR são regras de contribuição; não pressupõem proteção de branch configurada no GitHub.

Este repositório é público. Não versione sessões do WhatsApp, credenciais ou código dos serviços privados em nenhuma branch.

## Conclusão de tarefas e autoria

Uma tarefa em `feature/*`, `feat/*` ou `fix/*` só termina depois de validar e mesclar a branch na branch de destino definida pelo fluxo do repositório. Não deixe trabalho concluído isolado em uma branch: isso dificulta encontrar o código que realmente será distribuído e acumula branches obsoletas.

Após confirmar o merge no remoto, apague a branch temporária no GitHub e localmente (`git branch -d <branch>`) e rode `git fetch --prune`. Habilite a exclusão automática após merge somente com as branches permanentes protegidas contra exclusão. Quando o plano do GitHub não permitir essa proteção, mantenha a exclusão automática desabilitada e remova manualmente apenas branches temporárias já mescladas. Nunca apague uma branch com commits ainda não integrados; informe a pendência ao responsável. Branches permanentes e branches de ambiente são preservadas. Merge de feature encerra a tarefa na linha de desenvolvimento; a promoção para distribuição segue o fluxo de release.

Não cite assistentes, modelos ou serviços de IA como autores ou coautores de commits ou PRs. Não adicione trailers `Co-authored-by` para IA nem assinaturas de ferramentas de IA. A autoria fica com os responsáveis humanos; preserve atribuições humanas legítimas, licenças e avisos de terceiros. Esta regra vale para novos registros e não autoriza reescrever histórico publicado.

## Integração não oficial e responsabilidade pelo uso

O Arara Zap e a integração WhatsApp do Arara Code são projetos independentes, sem afiliação, associação, autorização, patrocínio ou endosso do WhatsApp ou da Meta. A conexão via Baileys usa o WhatsApp Web; não é a API oficial WhatsApp Business Platform. WhatsApp, Meta e demais marcas pertencem aos respectivos titulares.

O uso é por sua conta e risco. Cabe a cada usuário avaliar a adequação da integração, cumprir os termos do WhatsApp, a legislação aplicável e os direitos de terceiros, obter as autorizações necessárias e responder pelas mensagens, dados, comandos e ações executados com sua conta. Os mantenedores não incentivam nem autorizam spam, assédio, vigilância sem consentimento, disparos abusivos ou outras violações desses termos e direitos.

O software é fornecido no estado em que se encontra, sem garantias de funcionamento, disponibilidade, compatibilidade ou continuidade. Mudanças no WhatsApp podem interromper a integração; o uso pode resultar em restrições, suspensão ou banimento da conta. Não há garantia de recuperação da conta, de mensagens ou de dados.

Na máxima extensão permitida pela legislação aplicável e observada a licença de cada componente, autores, contribuidores e mantenedores não assumem responsabilidade por uso indevido, bloqueios de contas, perda de dados, danos diretos ou indiretos, prejuízos ou reclamações decorrentes do uso ou da impossibilidade de uso da integração. Este aviso não exclui responsabilidades que não possam ser afastadas por lei.

Referências de abordagem: [aviso do Baileys](https://github.com/WhiskeySockets/Baileys/blob/master/.github/README.md#disclaimer), [integrações da Evolution API](https://github.com/evolution-foundation/evolution-api#connection-types) e [cláusulas 7 e 8 da licença da Evolution API](https://github.com/evolution-foundation/evolution-api/blob/main/LICENSE). Essas referências não implicam vínculo com esses projetos nem alteram as licenças do Arara.

## Node — Windows, Linux e macOS

Instale Node 22.16 ou superior e Git. No PowerShell (Windows) ou terminal (Linux/macOS):

```sh
git clone https://github.com/arara-ide/arara-zap.git
cd arara-zap
npm ci --ignore-scripts
npm run dev
```

Em Arara Code → Configurações → WhatsApp, escolha **Nesta máquina**, informe o número autorizado com DDI e escolha projetos. Salve e conecte. O QR aparece na IDE; no celular da sessão, abra **Dispositivos conectados → Conectar dispositivo**. Envie `arara` a partir do número autorizado, inclusive em uma conversa consigo mesmo.

O modo local cria uma senha aleatória e um descritor em `~/.arara-zap/connection.json` (Windows: pasta do seu usuário). A IDE lê somente esse arquivo local. Não existe senha embutida na IDE ou confiança em headers. Se configurar `ZAP_DATA_DIR`, use a URL e senha manualmente. A IDE também oferece **Iniciar arara-zap instalado**: procura pastas usuais e próximas ao projeto, ou permite selecionar a instalação; confirma o caminho antes de executar `npm run dev`. Instale dependências antes.

`npm run dev` reinicia ao editar código. Para execução contínua use `npm start`. Para encerrar, Ctrl+C.

## Servidor

Copie `.env.example` para `.env` (`Copy-Item .env.example .env` no PowerShell, `cp .env.example .env` no Linux/macOS). Gere uma senha:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Defina `ZAP_PASSWORD` com essa senha, `ZAP_ALLOWED_NUMBER` com o número autorizado e `ZAP_HOST=0.0.0.0`. `ZAP_PORT` padrão é 7310. Coloque um proxy TLS na frente, encaminhando somente o upgrade WebSocket `/zap`; restrinja a porta interna ao proxy/firewall. Na IDE escolha **Em servidor**, informe `wss://seu-servidor/zap`, a senha e o mesmo número. Salve e conecte; só depois da autenticação aparece o QR. Não use WS sem TLS fora do loopback.

## Docker

Com Docker Desktop (Windows/macOS) ou Docker Engine + Compose (Linux), configure `ZAP_PASSWORD` em `.env` e rode:

```sh
docker compose up -d --build
docker compose logs -f
docker compose down
```

O Compose publica só `127.0.0.1:7310`. Use essa URL e a senha manualmente na IDE (Docker não compartilha o descritor do host). Para servidor, use proxy TLS e rede privada do Docker; mantenha a porta bloqueada externamente. O volume `zap-data` preserva a sessão. Imagens dos releases: `ghcr.io/arara-ide/arara-zap:<versão>` para amd64/arm64; a Action publica no fluxo de `main`, usando a tag `vX.Y.Z` gerada pela release.

## Releases e atualização automática

Após um push na `main`, o CI testa Linux, Windows e macOS com Node 22 e 24. Se todos passarem, publica a release `vX.Y.Z` conforme a versão de `package.json` e publica a imagem Docker no mesmo fluxo. Antes de publicar novas alterações, aumente a versão em `package.json` e `package-lock.json` (por exemplo, `npm version patch --no-git-tag-version`). Uma tag existente nunca é movida para outro commit.

Ao iniciar, o arara-zap consulta a última release estável e atualiza somente se sua versão for maior que a instalada. Alterações locais impedem a substituição automática. A instalação anterior fica preservada em uma pasta de backup.

No modo **Em servidor**, a IDE verifica a versão informada pelo serviço após autenticar. Se houver uma release estável mais recente, mostra uma notificação pedindo para atualizar o serviço no servidor, com **Ver atualização**. A conexão e o controle pelo WhatsApp continuam disponíveis. Serviços antigos sem informação de versão recebem uma orientação para atualizar; indisponibilidade do GitHub não impede o uso.

## Segurança e operação

- Somente `/zap` aceita upgrade; HTTP comum retorna 404. WebSocket também precisa de autenticação; o transporte sozinho não garante segurança.
- Desafio único HMAC, chave derivada por scrypt, timeout de autenticação, limites de payload/conexões/requisições, heartbeat e backpressure. Uma IDE por serviço.
- QR e mensagens só chegam ao cliente autenticado. Senha no cofre da IDE, nunca na webview ou em logs.
- Sessão WhatsApp criptografada com AES-256-GCM e gravação atômica. Diretório privado (0700), arquivos 0600 no Unix; no Windows use uma conta individual e ACL privada na pasta do usuário. Administradores e processos da mesma conta ainda podem ler credenciais.
- Um número autorizado, resolvido pelo próprio WhatsApp para seu identificador canônico. Não há equivalência de números adivinhada localmente. Grupos, mídias e histórico são ignorados. Mensagens próprias só entram quando o número configurado é a própria conta; todos os textos e títulos de enquetes do bot recebem `🦜 | ` e são ignorados na entrada da conversa consigo mesmo para impedir loop. Nada de shell, leitura de arquivos ou envio a destinatários arbitrários pelo protocolo.
- Sem fila persistente: pedidos com IDE desconectada não executam depois. Polls recentes ficam só em memória (100). Sem reenvio automático de mensagens com entrega incerta.
- Preserve a senha para abrir a sessão criptografada. Ao desvincular pelo celular, a sessão revogada é substituída automaticamente e um novo QR aparece na IDE conectada. Para revogar a sessão, use Dispositivos conectados no celular.
- Um processo por diretório. Se houver queda abrupta, confira que o serviço parou antes de remover `process.lock`. Desconectar a IDE fecha também a conexão WhatsApp; reconectar reabre a sessão.

## Protocolo v1

Servidor envia `{type:"challenge",version:1,nonce}`. Cliente responde `{type:"auth",number,proof}`; proof é HMAC-SHA256 da string `arara-zap/v1:<nonce>:<number>`, com chave scrypt(senha, `arara-zap/v1`, 32). Após `{type:"ready",serverVersion:"X.Y.Z"}`, aceita `{id,op:"send",text}`, `{id,op:"poll",title,values}` e `{id,op:"edit",messageId,text}`; retorna `{type:"result",id,result,error?}`. `send` retorna o ID da mensagem; `edit` só aceita ID de texto enviado ao destino autorizado pelo socket atual. Eventos: `qr`, `status`, `message` e votos como `message.poll={id,option}`. Nenhuma operação permite definir outro destinatário.

```sh
npm test
npm run build
```

Testes não conectam ao WhatsApp real. Valide pareamento, votos e reconexão com seus números antes de uso contínuo. Baileys é dependência com versão fixa no lockfile; atualizações precisam dessa validação.

## Revisão e segurança dos PRs

A `main` exige pull request, resolução das conversas de revisão e preservação do histórico (sem force push). A proteção não concede exceção de push direto a administradores ou bots. A configuração inicial permite merge pelo mantenedor único sem exigir a aprovação de uma segunda pessoa; contribuições externas devem ser revisadas pelo mantenedor antes do merge.

O CodeRabbit tem configuração em `.coderabbit.yaml` para resumos e revisão em português. Sua ativação depende da instalação do [GitHub App](https://github.com/apps/coderabbitai) somente neste repositório público. Não autorize acesso aos repositórios privados. O serviço oferece revisão gratuita para projetos open source; confira as condições ao instalar.

Alertas do Dependabot, detecção de segredos e proteção de push com segredos estão habilitados. Análise automática ajuda a detectar vulnerabilidades e alterações suspeitas, mas não certifica ausência de malware, backdoors ou problemas de licença. Alterações em comandos, rede, instaladores, atualizadores e workflows exigem revisão humana cuidadosa.

Os workflows de release não fazem push diretamente na `main`. Prepare mudanças de versão e changelog por PR antes de publicar.
