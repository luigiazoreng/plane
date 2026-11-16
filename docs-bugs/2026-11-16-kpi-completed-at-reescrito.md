# KPI negativo por regravação de completed_at

## Sintoma e diagnóstico

O diagnóstico fornecido em 16/11/2026 lista 469 cartas concluídas do projeto
Chatbot (`f59e35d6-d1f1-4563-a3a8-8121da0e8470`), workspace `growatt`, como
afetadas por edições em lote em 11/11/2026. A revisão do CSV encontrado em
`/home/luigi/Downloads/plane-kpi-chatbot-2026-11-16` corrigiu dois pontos:

- 459 cartas têm regravação entre **19:28:15 e 19:51:00 UTC**; o lote vai além
  de 19:38, horário citado no diagnóstico.
- As outras 10 já tinham conclusão entre 19:04 e 19:10 UTC. A data proposta de
  restauração difere da existente por apenas 0,1 a 11,2 segundos, compatível com
  o atraso de registro da atividade após o save. A recuperação revisada preserva
  essas datas, que são anteriores ao lote.

Essa revisão inicialmente usou os arquivos do levantamento. Posteriormente, o
acesso à VPS e a conferência de produção foram confirmados por SSH, conforme a
seção abaixo. O conector Plane retornou HTTP 403 nas tentativas de leitura de
duas cartas; esse problema de acesso do conector permanece separado do SSH.

O KPI usa `completed_at` para calcular atraso e selecionar o período. Regravar
essa data coloca entregas antigas na janela recente e produz atraso artificial.

## Causa raiz

`apps/api/plane/db/models/issue.py`, método `Issue.save()`, atribuía `timezone.now()`
em toda gravação de carta em estado do grupo `completed`. A edição de prioridade
pela API pública ou pela tela passava por esse método.

Havia ainda dois casos relacionados: a criação sem estado explícito não calculava
a conclusão após selecionar o estado padrão; gravações com `update_fields` contendo
somente `state` não persistiam a atualização de `completed_at`.

## Plano e correção implementada

1. Corrigir o modelo antes da recuperação dos dados históricos:
   - preservar uma data existente enquanto a carta permanece concluída;
   - preencher a data ausente ao concluir, inclusive na criação em estado padrão
     concluído;
   - limpar a data ao sair do grupo concluído, permitindo registrar nova data ao
     concluir novamente;
   - persistir `completed_at` junto com `state`/`state_id` em gravações parciais;
   - não aplicar mudanças de estado em memória em uma gravação parcial que exclui
     esse campo.
2. Validar o modelo, os endpoints de edição e a seleção de período do KPI.
3. Publicar a correção em todos os processos que gravam cartas: API e workers que
   carregam o modelo. Reiniciar processos antigos antes de restaurar os dados.
4. Fazer backup e restaurar as datas históricas com
   `Downloads/plane-kpi-chatbot-2026-11-16/restaurar-completed-at.revisado.sql`,
   preparado a partir do CSV fornecido. Os arquivos originais foram preservados.
5. Conferir as cartas e os agregados do KPI nos períodos `30d` e `all`.

A correção não exige migração de esquema. Ela preserva datas já presentes,
inclusive datas incorretas do incidente; a recuperação histórica é uma etapa
separada e necessária.

## Validação

- `plane/tests/unit/models/test_issue_completion.py`: edição de título/prioridade,
  movimentação entre estados concluídos, conclusão/reabertura/nova conclusão,
  gravações completas e parciais, criação com estado explícito ou padrão, data
  ausente e preservação de data importada.
- `TestCompletedIssueEdits` em `plane/tests/contract/app/test_kpi.py`: PATCH de
  prioridade pela tela, API v1 legada e API `work-items`; PUT/limpeza de propriedade
  de estimativa padrão e Difficulty; transições pela API da tela. A carta entregue
  há 90 dias permanece fora de `30d` após edição e conserva atraso zero em `all`.
- Suítes relacionadas: modelos, motor e endpoints de KPI, permissões de KPI,
  propriedades de estimativa, estimativas e filtros da API pública.

Os testes usam PostgreSQL 15 e Redis/Valkey isolados, sem dados de produção.

Resultado local: **175 testes passaram** em 41,06 segundos. Antes da correção,
o novo arquivo de testes do modelo apresentou oito falhas e três sucessos,
reproduzindo a sobrescrita e os casos relacionados.

Comando, a partir de `apps/api`, com `DATABASE_URL` e `REDIS_URL` apontando para
serviços de teste, `AMQP_URL=memory://` e `WEB_URL=http://localhost:3000`:

```bash
.venv/bin/python -m pytest \
  plane/tests/unit/models/ plane/tests/unit/kpi/ \
  plane/tests/contract/app/test_kpi.py \
  plane/tests/contract/app/test_kpi_access.py \
  plane/tests/contract/app/test_estimate_property_values.py \
  plane/tests/contract/app/test_estimates_app.py \
  plane/tests/contract/api/test_work_items_filtering.py \
  --tb=short -q -p no:cacheprovider
```

O Ruff passou no modelo, no endpoint de prioridade do KPI e no novo teste do
modelo. `test_kpi.py` conserva seis ocorrências preexistentes de E501 (linhas
longas), confirmadas também no conteúdo de HEAD; nenhuma está no bloco adicionado.

## Revisão e ensaio da recuperação

O SQL original e o CSV têm os mesmos 469 IDs únicos, sendo 362 do histórico e
107 de criação. O ensaio do SQL original confirmou que também altera as dez
conclusões anteriores ao lote. A lista dessas cartas está em
`Downloads/plane-kpi-chatbot-2026-11-16/cartas-preservadas.csv`.

O SQL revisado contém 459 registros (352 do histórico e 107 de criação) e:

- compara o `completed_at` atual exatamente com o CSV, aceitando também a data
  já restaurada para permitir reexecução;
- verifica projeto, workspace, estado concluído, exclusão e `created_at` dos
  registros cuja evidência é a criação;
- bloqueia as cartas durante a transação e salva a linha anterior completa em
  `public.plane_kpi_completed_at_backup_20261116`;
- altera somente `completed_at`, verifica individualmente todas as datas e deixa
  o COMMIT para a sessão que executou o script.

**12 verificações passaram** em PostgreSQL 17 isolado, com uma tabela de cartas
sintética reconstruída do CSV: ensaio do original, rollback completo, commit com
backup persistente, reexecução sem UPDATE e recusa de oito conflitos (nova data,
carta reaberta, outro projeto, outro workspace, carta excluída, carta ausente,
criação divergente e backup incompatível). Uma carta adicional fora do manifesto
permaneceu intacta, assim como as dez preservadas e todos os outros campos.

O ensaio valida o script e suas proteções; a consulta de produção descrita abaixo
confirma a correspondência atual com o CSV. Nenhuma dessas verificações substitui
a evidência histórica usada para propor as datas originais. O relatório e os
hashes SHA256 dos arquivos originais e do SQL revisado estão em
`Downloads/plane-kpi-chatbot-2026-11-16/validacao-restauracao.json`.

## Acesso e conferência de produção

Em 16/11/2026, o acesso SSH pelo alias `anygrid-apis-vps` foi confirmado como
`root`, no host `vmi2772389`. A instalação é gerenciada pelo Dokploy, com compose
em `/etc/dokploy/compose/plane-plane-sckuy0/code/docker-compose.yml` e containers
com prefixo `plane-plane-sckuy0-`.

A API, worker e beat-worker usam a mesma imagem backend, e o arquivo do modelo
em execução ainda coincide com o original de HEAD, contendo a sobrescrita de
`completed_at`. A correção local ainda precisa ser publicada.

A conferência da base, em transação explicitamente READ ONLY, confirmou:

- 459 cartas elegíveis ainda têm exatamente a data observada no CSV;
- nenhuma carta está ausente, reaberta, excluída ou fora do projeto/workspace;
- os 107 `created_at` coincidem com o CSV, e não há conflitos de datas;
- as dez cartas preservadas continuam com as datas anteriores ao lote.

O relatório `Downloads/plane-kpi-chatbot-2026-11-16/preflight-producao.json`
registra essas contagens e os indicadores atuais de `30d` e `all`, calculados
com as mesmas funções do módulo KPI em execução. Exemplo: a eficiência de Luigi
é -2,6731 em `30d` e -2,1133 em `all`, coerente com o diagnóstico recebido.
Nenhuma gravação de dados nem publicação foi realizada nesta conferência.

## Recuperação em produção

Executar após publicar e verificar a versão corrigida:

1. Suspender temporariamente o lote de avaliação e outras gravações durante a
   recuperação. Fazer backup persistente de `issues` e das atividades usadas na
   reconstrução; confirmar que o backup pode ser lido/restaurado.
2. Revisar `restaurar-completed-at.revisado.sql`, `cartas-afetadas.csv` e
   `cartas-preservadas.csv` contra o estado atual da base. Conferir o
   workspace/projeto e novas conclusões legítimas. As datas devem vir das
   evidências do histórico, nunca de `target_date`. Usar a versão revisada, pois
   o SQL original também modifica as dez cartas anteriores ao lote.
3. Abrir `psql` interativo e carregar o SQL revisado com `\i /caminho/do/arquivo`.
   O arquivo abre uma transação e não executa COMMIT. Na primeira aplicação
   integral, são esperados 352 registros `history`, 107 `created_at`, 459 backups
   e zero divergências. Reexecução pode alterar menos registros porque aceita
   datas já restauradas. Se houver conflito ou contagens inesperadas, ROLLBACK e
   investigar. Não executar com `psql -f` e encerrar a conexão esperando aplicar:
   sem COMMIT na mesma sessão, PostgreSQL desfaz a transação.
4. Verificar no próprio banco os valores restaurados e confirmar a transação.
   Manter o backup do valor anterior para reversão. A comparação exata com as
   datas do CSV preserva novas conclusões e a conferência final cobre também as
   regravações entre 19:40 e 19:51, omitidas do SELECT final original.
5. Conferir CHABOT-1127: a data deve corresponder à transição de 25/08/2026 no
   histórico. Editar sua prioridade após a publicação e confirmar que
   `completed_at` permanece exatamente igual.
6. Consultar `/api/workspaces/growatt/projects/<project_id>/kpi/members/` e
   `/kpi/issues/` nos períodos `30d` e `all`. As entregas antigas restauradas
   devem sair de `30d`. Comparar com o levantamento como estimativa, pois novas
   cartas e mudanças de configuração podem alterar os agregados.

O workflow `.github/workflows/build-custom-images.yml` publica as imagens ao
receber push em `stable-1.3.1` e chama um webhook de deploy após os builds.
`docker-compose.prod.yml` usa a mesma imagem backend na API, worker e beat-worker.
O acesso e a instalação reais do servidor foram identificados. Restam publicar a
correção, confirmar a nova versão em execução e recuperar o banco com backup.
Nenhuma publicação nem alteração de dados de produção foi executada nesta etapa.

As 73 cartas importadas com prazo anterior à criação do workspace representam
outro problema de dados. Excluir cartas anteriores ao KPI ou alterar prazos exige
uma decisão de negócio separada; esta correção não muda a regra de cálculo.

## Prevenção de regressão

Manter os testes de conclusão nas atualizações do upstream: a implementação
anterior pode voltar durante merges. `QuerySet.update()` e `bulk_update()` não
executam `Issue.save()`; quem altera estado por esses caminhos deve manter
`completed_at` explicitamente.
