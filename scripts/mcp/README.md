# MCP local: execução e limites

O endpoint `/mcp` usa a fila do desktop. Não é um downloader independente.
O aplicativo deve permanecer aberto, com a bridge e o servidor MCP ativados.
O token da extensão **não** autentica clientes MCP.

Em **LLM → MCP → Your endpoint**, crie uma conexão por cliente, selecione as permissões
e copie a configuração enquanto o token está disponível. Apenas o hash do token
é persistido. Revogar a conexão impede novas chamadas e invalida o worker externo no próximo
check de autoridade (intervalo de 250 ms), seguido de encerramento dos processos.
Cada conexão consulta/controla os jobs que criou. O grant de rede local vem
desmarcado; habilite-o somente para fontes locais que você pretende acessar.

## Transportes

HTTP local: `http://127.0.0.1:<porta-da-bridge>/mcp`. Envie bearer, Content-Type
JSON, Accept `application/json, text/event-stream` e MCP-Protocol-Version.
Revisões implementadas: `2025-03-26` e `2025-06-18`. GET não oferece SSE; o servidor
responde 405. POST de notificação retorna 202. Batches JSON-RPC são aceitos nas
duas revisões (até 32 mensagens; lote vazio, acima do limite ou com `initialize`
dá `-32600`); um lote só de notificações/respostas retorna 202 sem corpo.
Host deve ser loopback e chamadas com Origin são rejeitadas.

Stdio: instale o binário `omniget-mcp` do pacote CLI e configure no cliente:

```json
{
  "mcpServers": {
    "omniget": {
      "command": "/caminho/absoluto/omniget-mcp",
      "env": {
        "OMNIGET_MCP_URL": "http://127.0.0.1:47720/mcp",
        "OMNIGET_MCP_TOKEN": "TOKEN_DA_CONEXAO_LOCAL"
      }
    }
  }
}
```

Use o gerenciador de segredos do cliente quando disponível. Não cole tokens em
conversas. O adaptador encaminha mensagens ao desktop e só escreve JSON-RPC no
stdout. Ele não inicia o desktop nem cria outra fila. Com o aplicativo fechado,
retorna `APP_NOT_RUNNING` a cada requisição (notificações e respostas do cliente
nunca recebem resposta). Um batch no stdio é encaminhado como no HTTP e recebe um
array de respostas. `omniget_health` diz se o app está acessível, a versão e o
protocolo. Chamadas são sequenciais; `download_wait` pode ocupar
o adaptador por até 25 segundos.

## Contratos e diagnóstico

As ferramentas disponíveis dependem dos scopes. `tools/list` é a referência da
versão instalada. Mutações exigem `idempotencyKey`; repetição da mesma intenção
retorna seu recibo, e argumentos diferentes produzem conflito. Um recibo pendente
após crash retorna `OUTCOME_UNKNOWN`: inspecione a fila antes de criar nova intenção.
A admissão grava ID, proprietário e opções antes do enqueue. Recuperação anterior
ao efeito reconstrói a mesma intenção; execução sem resultado demonstrável fica
unknown e não é reenviada automaticamente.

`maxHeight` é um teto de altura, inclusive para vídeos verticais. Formatos acima do
teto não devem ser anunciados como sucesso. A verificação usa ffprobe; não há
transcodificação silenciosa. `download_artifacts` informa o nível da validação e, com scope transfer e uma
raiz concedida localmente, fornece artifact ID, digest e rota de transferência.
A transferência exige bearer e If-Match, expira e revalida revogação durante o
stream. A validação de metadados não promete decode completo.

Logs sanitizados ficam em `tools/download-journal/events.sqlite3`, com tentativa,
paginação, limite de resposta e retenção lógica de 14 dias/100 MiB. A retenção não
é um limite físico rígido do arquivo SQLite. Falhas de escrita/canal sinalizam
evidência incompleta; contadores persistentes e um registro de emergência
preservam as perdas entre reinícios dentro dos limites documentados nos testes.
Diagnóstico por regras preserva incerteza: 403 sozinho não prova login nem bot
challenge. Um erro de extractor não prova engine desatualizada.

## Gateway remoto experimental

`omniget-gateway PRIVATE_CONFIG.json` é um processo separado, desativado por
default. Requer arquivo privado (0600 no Unix), recurso/issuer/introspection HTTPS,
cliente OAuth e binding explícito entre subject, client_id e conexão local.
Introspecção verifica expiração, audiência, issuer, scopes e revogação por chamada.
O provedor externo deve oferecer o fluxo de autorização/PKCE e seu metadata.

Exemplo estrutural, com valores fictícios:

```json
{
  "listen": "127.0.0.1:47740",
  "resource": "https://mcp.example.com/mcp",
  "issuer": "https://auth.example.com",
  "introspection_url": "https://auth.example.com/introspect",
  "introspection_client_id": "omniget-gateway",
  "introspection_client_secret": "SECRET_STORED_LOCALLY",
  "desktop_url": "http://127.0.0.1:47720/mcp",
  "bindings": [{
    "client_id": "authorized-client",
    "subject": "authorized-user",
    "desktop_token": "LOCAL_CONNECTION_TOKEN",
    "tools": ["download_status", "download_logs", "download_diagnose"]
  }]
}
```

Opcionalmente, `cloudflare` aceita `tunnel_id` e `credentials_file` absoluto.
O processo gera ingress apenas para o gateway, com fallback 404, e supervisiona
`cloudflared`; a bridge interna não deve ser publicada. Não há configuração ou
supervisão desse processo na UI ainda. Nenhum túnel foi publicado neste trabalho.

O gateway aceita somente leitura dos jobs autorizados. Download remoto está
bloqueado até integrar e verificar o worker confinado no caminho do gateway.
Não anuncie suporte a escrita remota, transferência pelo gateway ou
compatibilidade universal.

## Worker confinado

O build Tauri prepara e empacota `omniget-worker` como sidecar. Builds Cargo diretos devem executar antes `node scripts/mcp/build-worker.mjs --debug` na raiz do projeto. O helper não provisiona engines nem importa cookies pessoais. Se ele estiver ausente ou a plataforma não oferecer o isolamento implementado, a chamada falha explicitamente; não há fallback para o downloader pessoal. O isolamento de processos atual foi implementado e testado no macOS; não constitui comprovação de suporte equivalente em Windows/Linux.

Grants de rede local são endereços IP e portas exatos selecionados na interface. O scope `local_network` sozinho não permite a LAN inteira. Cada sessão de broker exige autenticação efêmera, e a credencial não é repassada ao destino.

Concessões de execução fixam executor, workspace e teto de tokens. A execução nativa de arquivos cria apenas arquivos novos; overwrite e shell permanecem bloqueados até a integração de exclusividade. Higgsfield exige configuração local da CLI e um teto separado por missão; a presença de créditos na conta não concede permissão para gastar.
