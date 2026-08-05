# Stage B2 — Build Frontend
## Status: COMPLETE

## Apps modificados
- `packages/editor`: novo caminho `onAttachmentFile`/`treatImagesAsAttachments` propagado de `IEditorProps` até `DropHandlerPlugin`/`insertFilesSafely`, cobrindo paste/drop de arquivo genérico e imagem tratada como attachment.
- `apps/web`: novo wrapper `HelpdeskDescriptionEditor` (editor rich text sem hooks autenticados de workspace), integrado ao `form-renderer.tsx` (campo `system_description`/`long_text`), e estado de `additionalAttachmentIds` levantado no `page.tsx` do formulário público com merge/dedup em `asset_ids` no submit. `entity_type: "HELPDESK_REQUEST_ATTACHMENT"` agora é passado explicitamente no `attachmentTransport` compartilhado (editor de descrição E campo de anexo dedicado), fechando o gap de segurança de dado identificado no plano.

## Rotas novas/alteradas
| Rota | Arquivo | Descrição |
|---|---|---|
| `/helpdesk/p/:publicSlug/forms/:formSlug` | `apps/web/app/helpdesk/p/[publicSlug]/forms/[formSlug]/page.tsx` | Estado `additionalAttachmentIds` levantado; `attachmentTransport.getCredentials` agora envia `entity_type` explícito; `handleSubmit` faz merge+dedup de `asset_ids` (campo dedicado + paste/drop do editor) |

## Stores e services
- Nenhum store novo. Nenhum service novo — `PublicHelpdeskService.getAssetUploadCredentials`/`HelpdeskService.getAssetUploadCredentials` (`packages/services/src/helpdesk/helpdesk.service.ts`) já aceitavam `entity_type?: string` no payload antes desta feature; reusados sem alteração de assinatura.

## Componentes
- NOVO: `apps/web/core/components/helpdesk/description-editor.tsx` (`HelpdeskDescriptionEditor`) — wrapper de `RichTextEditorWithRef` (`@plane/editor`), modelado em `apps/space/components/editor/rich-text-editor.tsx`. Upload via `TAttachmentTransport` (reusado sem mudança de `apps/web/core/components/helpdesk/attachments/use-attachment-upload.ts`); limite de 5 arquivos por operação de paste/drop; imagens tratadas como attachment (`treatImagesAsAttachments`), nunca embutidas inline.
- MODIFICADO: `apps/web/core/components/helpdesk/form-renderer.tsx` — campo `system_description`/`long_text` renderiza `HelpdeskDescriptionEditor` quando `attachmentTransport` está disponível; fallback para `<textarea>` original quando não (preview do admin, `isPreview={true}`, sem upload real — sem regressão).
- REUSADOS sem mudança: `AttachmentPicker`, `PendingAttachmentChips`, `useAttachmentUpload` (`apps/web/core/components/helpdesk/attachments/`).

## Validação
- check:types (`pnpm --filter @plane/editor check:types`): limpo, zero erros.
- check:types (`pnpm --filter web check:types`): zero erros nos arquivos desta feature. Comando finaliza com exit 1 por 35 erros PRÉ-EXISTENTES (família `toSorted`/es2023 lib target + `all-properties.tsx` null/undefined), confirmados via `git stash` ANTES de qualquer mudança desta sessão — nenhum toca `description-editor.tsx`, `form-renderer.tsx` ou `page.tsx` do form público.
- check:lint (`pnpm --filter web check:lint`): 0 erros, 919 warnings (quase todos pré-existentes em toda a base). Um warning real encontrado e corrigido em `description-editor.tsx` (`.then()` sem return — `eslint-plugin-promise/always-return`); os outros dois matches em `form-renderer.tsx` (linhas 172 e 243) são pré-existentes, fora do diff desta feature (confirmado via `git diff`).
- build (`pnpm --filter web build`): exit 0, build completo (rota do form público foi tocada).
- Testes automatizados: N/A (apps/web sem runner — ver `.claude/instructions/stack.md`)

## A verificar no Stage H (UX)
- Preencher formulário público de ticket (`/helpdesk/p/:publicSlug/forms/:formSlug`): digitar texto formatado (negrito, lista, título) na descrição — confirmar toolbar/formatação funcionam no editor rich text.
- Colar uma imagem E arrastar um PDF (ou outro arquivo genérico) dentro do editor de descrição: nenhum dos dois deve aparecer inline no corpo do HTML; ambos devem virar chip de attachment pendente (reusa `PendingAttachmentChips`).
- Submeter o formulário com: descrição rica + 1 imagem colada + 1 arquivo colado + (se o form tiver) 1 arquivo no campo `attachment` dedicado. Confirmar no painel do agente que TODOS os anexos aparecem na listagem do ticket (não em "comentário"), e a descrição renderiza o HTML formatado corretamente.
- Tentar colar/soltar 6+ arquivos numa única operação: confirmar toast de "limite de arquivos excedido" e que só os primeiros 5 são aceitos.
- Tentar colar um arquivo maior que o limite de tamanho (MAX_FILE_SIZE): confirmar toast de "arquivo muito grande", sem crash do editor.
- Confirmar que o preview do admin (`/{workspaceSlug}/helpdesk/settings`, botão de preview do formulário) continua mostrando `<textarea>` simples (sem upload real) para o campo de descrição — não deve tentar montar o editor rich text completo nesse contexto.
- Estados cobertos: loading = chip "uploading" por arquivo em progresso (reusa `PendingAttachmentChips`, ícone `Loader2` girando); vazio = nenhum attachment ainda, editor mostra placeholder do campo; erro = toast de falha de upload ou de limite excedido (título "Falha no upload" / "Limite de arquivos excedido" / "Arquivo muito grande").
- Verificar em mobile (viewport estreito) que o editor de descrição não causa scroll horizontal e a toolbar/bubble menu do editor permanece utilizável.

## Desvios do plano
- Nenhum desvio funcional. Uma melhoria sobre o plano original: `entity_type: "HELPDESK_REQUEST_ATTACHMENT"` foi fixado no `attachmentTransport` COMPARTILHADO do `page.tsx` (usado tanto pelo editor de descrição quanto pelo campo de anexo dedicado) em vez de só dentro do wrapper do editor — cobre os dois pontos de upload do formulário com uma única mudança central, reforçando ainda mais a mitigação de risco já prevista no plano ("centralizar a chamada num único ponto para minimizar pontos de esquecimento").
- `packages/editor` precisou de rebuild (`pnpm --filter @plane/editor build`) para que `apps/web` enxergasse os novos tipos via `dist/` — documentado aqui porque não estava explícito no plano; não é uma mudança de código, é housekeeping de monorepo (o package é consumido via `dist/index.d.ts`, não via source direto).
