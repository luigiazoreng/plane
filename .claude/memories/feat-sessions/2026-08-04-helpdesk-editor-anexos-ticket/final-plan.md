# Final Implementation Plan (LOCKED)

## Tickets covered
- **HELPDESK-41** — Rich text editor no campo "descrição" do formulário de ticket do TI.
- **HELPDESK-38** — Anexos: rich text com possibilidade de anexar imagens/arquivos + campo de anexo dedicado (padrão UX ERPNext, sem integração real com ERPNext).
- **HELPDESK-47** — Paste/drop de imagem ou arquivo dentro do editor rich text vira attachment do ticket (não fica embutido como base64/blob no HTML).

Todos os 3 apontam para a mesma área de produto (formulário de criação/edição de ticket do Helpdesk), mesmo prazo (2026-08-07) e mesmos assignees (Luigi Azor, Pedro Cezar) — tratados aqui como uma única feature coesa.

Projeto Plane de origem: **IT System**.

## Review Changes Applied (Phase 3 → Phase 4)
- **[BLOCKER — Segurança]** `HelpdeskRequestSerializer.description` (`apps/api/plane/app/serializers/helpdesk.py`) não sanitiza HTML. Diferente do `Issue`/`Page`/`Workspace`/`Draft` serializers, que chamam `validate_html_content()` (`apps/api/plane/utils/content_validator.py`, nh3-based) antes de persistir `description_html`. Como esta feature introduz HTML de verdade pela primeira vez em `HelpdeskRequest.description` (hoje é plain text de um `<textarea>`), **Step 6 abaixo adiciona validação obrigatória** espelhando exatamente o padrão do Issue.
- **[BLOCKER — entity_type default errado]** `apps/api/plane/app/views/helpdesk/asset.py:53`: `entity_type = data.get("entity_type", COMMENT_ENTITY)` — o default é `HELPDESK_COMMENT_ATTACHMENT`, NÃO `HELPDESK_REQUEST_ATTACHMENT`. O plano anterior assumia (incorretamente) que bastava "confirmar" o default. **Step 4 e Step 5 abaixo exigem que TODA chamada de upload originada do formulário de ticket (tanto o editor de descrição quanto o campo de anexo dedicado) passe `entity_type: "HELPDESK_REQUEST_ATTACHMENT"` explicitamente** no payload de `getCredentials`. Sem isso, os anexos do formulário seriam indevidamente marcados como anexos de COMENTÁRIO — um bug de dado silencioso, não um erro visível.
- **[Gap de design resolvido — Option A]** Os asset_ids gerados pelo paste/drop dentro do editor de descrição precisam chegar ao mesmo array `asset_ids` que `handleSubmit` agrega em `page.tsx`. Adotada a Option A: o novo componente de editor expõe `onAdditionalAttachmentIds?: (assetIds: string[]) => void`; o estado "additional attachment ids" é levantado (lifted) para o componente pai (`HelpdeskPublicFormPage` em `page.tsx`, e o equivalente autenticado se aplicável); `handleSubmit` faz merge desse array com os `asset_ids` já coletados dos campos `field_type === "attachment"` antes de submeter. Isso preserva o contrato existente `onValueChange: (key: string, value: unknown) => void` sem overload — o editor de descrição continua reportando apenas string HTML via esse canal.
- **[Novo — limite de arquivos por paste/drop]** Adicionado Step 4 com limite de arquivos por operação de paste/drop dentro do editor de descrição, usando o mesmo teto já usado pelo campo de anexo dedicado (5 por seleção, visto em `AttachmentFieldInput`) como referência de UX consistente; o teto de servidor definitivo é `HELPDESK_MAX_ATTACHMENTS_PER_COMMENT` (`apps/api/plane/settings/common.py:365`, default 10) que já governa `bind_assets`. Motivo: superfície pública sem autenticação de workspace — sem esse teto, paste múltiplo é um vetor de abuso de upload paralelo.
- **[Test strategy explícita]** `packages/editor` não tem test runner (sem vitest/jest configurado, sem arquivos `*.test.ts(x)`/`*.spec.ts(x)` em `packages/editor/src`). Steps 1-3 são validados via `pnpm --filter @plane/editor check:types` + cenário de browser em `apps/web` (Stage H) — **não prometer RED/GREEN nessa camada**.
- **[Confirmado, sem mudança de plano]** Único ponto real de integração é `apps/web/app/helpdesk/p/[publicSlug]/forms/[formSlug]/page.tsx` (superfície pública). `apps/web/app/(all)/[workspaceSlug]/(projects)/helpdesk/settings/page.tsx` usa `HelpdeskFormRenderer` com `isPreview={true}` — é só o preview do admin configurando o formulário, sem upload real, sem submit. Não há form de ticket do Helpdesk em `apps/space` nem `apps/admin`.
- **[Confirmado, sem mudança de plano]** `IRichTextEditorProps` está definido em `packages/editor/src/core/types/editor.ts:189`.
- **[Confirmado, sem mudança de plano]** O padrão correto de wrapper de editor SEM hooks autenticados de workspace member é `apps/space/components/editor/lite-text-editor.tsx` (ou `rich-text-editor.tsx`), que usa um helper puro `getEditorFileHandlers(args): TFileHandler` (`apps/space/helpers/editor.helper.ts`) em vez de `useEditorConfig()`/`FileService`. Este é o molde para o novo wrapper do Helpdesk.
- **[Confirmado, sem mudança de plano]** Convenção de pasta: novo arquivo fica solto em `apps/web/core/components/helpdesk/` (não em subpasta própria), consistente com `comment-content.tsx`, `status-pill.tsx` já existentes nesse diretório.
- **[Confirmado, sem mudança de plano]** Sem migration — `HelpdeskRequest.description` já é `models.TextField(blank=True, default="")`, aceita string HTML sem alteração de schema. Serializer usa `fields = "__all__"`.

## Design Decisions (final)
1. **Sem novo `description_html`** — reusa `HelpdeskRequest.description` (TextField) para guardar o HTML do editor. Zero migration.
2. **Sem extensão TipTap de attachment visual** — `packages/editor` não tem um node "custom-attachment" equivalente a "custom-image". Arquivos (imagem ou não) colados/arrastados no editor de descrição do Helpdesk NÃO são inseridos no conteúdo rico; viram attachment do ticket, fora do corpo do HTML. Isso é a leitura literal do HELPDESK-47.
3. **Imagem colada no editor do Helpdesk também vira attachment**, ao contrário do editor de descrição do Issue (onde imagem colada fica embutida inline). Obtido desabilitando a auto-inserção de imagem (`insertImageComponent`) para esta instância de editor via uma nova prop `treatImagesAsAttachments`, roteando também imagens para o mesmo callback de attachment.
4. **`entity_type` sempre explícito** — toda chamada de `getCredentials`/`getAssetUploadCredentials` originada do formulário de ticket (editor de descrição OU campo de anexo dedicado) passa `entity_type: "HELPDESK_REQUEST_ATTACHMENT"` explicitamente. Nunca depender do default do endpoint (que é `COMMENT_ENTITY`).
5. **Agregação de asset_ids via Option A** (estado levantado + callback `onAdditionalAttachmentIds`) — ver "Review Changes Applied" acima.
6. **Validação de HTML obrigatória no backend** — `HelpdeskRequestSerializer` ganha um `validate_description` (ou lógica equivalente em `validate()`) chamando `validate_html_content()`, espelhando `IssueSerializer`.
7. **Limite de arquivos por paste/drop**: máximo 5 arquivos por operação de paste/drop no editor de descrição (consistente com o campo de anexo dedicado); backend já protege com `HELPDESK_MAX_ATTACHMENTS_PER_COMMENT` (10) via `bind_assets`.
8. **RBAC/superfícies**: portal público (customer, sem sessão de workspace member, `AllowAny` + JWT opcional de customer) e painel do agente (autenticado, ADMIN/MEMBER) — ambos já usam a mesma abstração `TAttachmentTransport`; o novo fluxo de editor reusa essa mesma abstração, sem criar uma segunda.

## Pattern Sources
- Editor wrapper SEM auth de workspace (MOLDE a copiar): `apps/space/components/editor/lite-text-editor.tsx` e `apps/space/components/editor/rich-text-editor.tsx`
- Helper de file handlers puro (MOLDE a copiar): `apps/space/helpers/editor.helper.ts` (`getEditorFileHandlers`)
- Editor wrapper autenticado (referência de estrutura, NÃO copiar hooks): `apps/web/core/components/editor/rich-text/editor.tsx`
- Uso do editor num formulário (padrão de Controller/react-hook-form, se aplicável): `apps/web/core/components/issues/issue-modal/components/description-editor.tsx`
- Attachment upload hook (REUSAR sem mudança): `apps/web/core/components/helpdesk/attachments/use-attachment-upload.ts` (`TAttachmentTransport`)
- Attachment picker/chips UI (REUSAR sem mudança): `apps/web/core/components/helpdesk/attachments/attachment-picker.tsx`, `attachment-chips.tsx`
- Form renderer (MODIFICAR): `apps/web/core/components/helpdesk/form-renderer.tsx`
- Public form page (MODIFICAR — lifted state): `apps/web/app/helpdesk/p/[publicSlug]/forms/[formSlug]/page.tsx`
- Backend bind helper (REUSAR sem mudança): `apps/api/plane/app/helpdesk/attachments.py` (`bind_assets`, `REQUEST_ENTITY`)
- Backend asset view (MODIFICAR — nenhuma mudança de default, só garantir aceite de entity_type explícito, já aceita): `apps/api/plane/app/views/helpdesk/asset.py`
- Backend serializer (MODIFICAR — validação de HTML): `apps/api/plane/app/serializers/helpdesk.py` (`HelpdeskRequestSerializer`)
- Backend validador (REUSAR sem mudança): `apps/api/plane/utils/content_validator.py` (`validate_html_content`)
- Padrão de uso do validador (COPIAR EXATAMENTE): `apps/api/plane/app/serializers/issue.py:136` (`is_valid, error_msg, sanitized_html = validate_html_content(attrs["description_html"])`)
- Editor plugin (MODIFICAR — o gap real): `packages/editor/src/core/plugins/drop.ts` (`insertFilesSafely`, branch `fileType === "attachment"` vazio)
- Editor types (MODIFICAR): `packages/editor/src/core/types/editor.ts:189` (`IRichTextEditorProps`), `packages/editor/src/core/types/config.ts` (`TFileHandler`)
- Services (REUSAR sem mudança): `packages/services/src/helpdesk/helpdesk.service.ts` (`HelpdeskService.getAssetUploadCredentials`/`markAssetUploaded` — agente; `PublicHelpdeskService.getAssetUploadCredentials`/`markAssetUploaded` — portal)
- Backend teste (padrão a seguir): `apps/api/plane/tests/unit/helpdesk/test_helpdesk_attachments.py`
- Types: `packages/types/src/helpdesk.ts` (`IHelpdeskFieldType`, `IHelpdeskFormField`)
- Migration: N/A — nenhuma migration necessária.

## Ticket → Step Mapping
- **HELPDESK-41** → Steps 1, 2, 3, 7 (editor rich text substitui textarea)
- **HELPDESK-38** → Steps 1, 2, 3, 4, 7 (rich text com anexo) + Step 8 (campo de anexo dedicado — já funciona, só precisa do fix de `entity_type` do Step 5)
- **HELPDESK-47** → Steps 1, 2, 4 (paste/drop vira attachment, não embutido)
- **Transversal (todas as 3)** → Steps 5 (entity_type explícito), 6 (sanitização HTML), 9 (testes backend)

## Implementation Steps

### Step 1 (frontend — `packages/editor`): Implementar branch de arquivo genérico em `insertFilesSafely`
- File: `packages/editor/src/core/plugins/drop.ts`
- Action: modify
- What: O branch `fileType === "attachment"` (atualmente vazio, linhas ~129-130) passa a invocar um novo callback opcional em vez de ficar vazio. Adicionar prop `onAttachmentFile?: (file: File) => void` em `DropHandlerPlugin`/`insertFilesSafely`. Adicionar também `treatImagesAsAttachments?: boolean`: quando `true`, o branch de imagem NÃO chama `editor.commands.insertImageComponent(...)` — em vez disso, chama o mesmo `onAttachmentFile` callback. Isso cobre tanto HELPDESK-47 (arquivo genérico) quanto a Design Decision 3 (imagem também vira attachment neste contexto específico).
- Copy from: estrutura do branch `fileType === "image"` já existente (mesma função, apenas trocando o destino da chamada)
- Dependencies: nenhuma
- ⚠️ Sem runner de teste em `packages/editor` — não planejar RED/GREEN aqui.
- [ ] Validação: `pnpm --filter @plane/editor check:types` → ___
- [ ] Cenário para Stage H: colar uma imagem e um PDF dentro do editor de descrição do ticket; nenhum dos dois deve aparecer inline no corpo do texto; ambos devem disparar o callback de attachment.

### Step 2 (frontend — `packages/editor`): Propagar novas props pela superfície pública do editor
- File: `packages/editor/src/core/types/editor.ts` (adicionar em `IRichTextEditorProps`, linha ~189), `packages/editor/src/core/types/config.ts` (se `TFileHandler` precisar de ajuste — avaliar se basta prop de nível de editor em vez de fileHandler)
- Action: modify
- What: Adicionar `onAttachmentFile?: (file: File) => void` e `treatImagesAsAttachments?: boolean` como props opcionais de `IRichTextEditorProps`, encaminhadas internamente até `DropHandlerPlugin` (verificar onde a extensão/plugin é instanciada dentro do core do editor — provavelmente em `packages/editor/src/core/extensions/*.ts` ou no ponto de montagem de plugins do editor principal).
- Dependencies: Step 1
- ⚠️ Sem runner — validação: `pnpm --filter @plane/editor check:types` → ___

### Step 3 (frontend — `apps/web`, NOVO arquivo): Wrapper de editor do Helpdesk, sem hooks autenticados de workspace
- File: `apps/web/core/components/helpdesk/description-editor.tsx`
- Action: create
- What: Wrapper em torno de `RichTextEditorWithRef` (`@plane/editor`), modelado em `apps/space/components/editor/rich-text-editor.tsx` (estrutura) + `apps/space/helpers/editor.helper.ts` (helper puro `getEditorFileHandlers`, adaptado para receber `TAttachmentTransport` do Helpdesk em vez de `SitesFileService`). NÃO usa `useEditorConfig`/`useMember`/`useEditorFlagging` de `apps/web/core/components/editor/rich-text/editor.tsx` — esses hooks dependem de sessão de workspace member, indisponível no portal público. Props aceitas: `value`, `onChange(html: string)`, `attachmentTransport: TAttachmentTransport`, `onAdditionalAttachmentIds?: (assetIds: string[]) => void`, `disabled?: boolean`. Internamente: `fileHandler.upload` chama `attachmentTransport.getCredentials({..., entity_type: "HELPDESK_REQUEST_ATTACHMENT"})` (Design Decision 4) seguido de `attachmentTransport.markUploaded`; passa `treatImagesAsAttachments: true` e `onAttachmentFile` para o editor, que ao completar um upload soma o `asset_id` num array local e o repassa via `onAdditionalAttachmentIds`. Limita a 5 arquivos por operação de paste/drop (Design Decision 7) — arquivos além do limite são rejeitados com toast, mesma UX de `useAttachmentUpload`.
- Copy from: `apps/space/components/editor/rich-text-editor.tsx` (estrutura do wrapper), `apps/space/helpers/editor.helper.ts` (padrão de helper puro), `apps/web/core/components/helpdesk/attachments/use-attachment-upload.ts` (forma do `TAttachmentTransport` e do toast de erro/limite)
- Dependencies: Steps 1, 2
- ⚠️ Sem runner — validação: `pnpm --filter web check:types` → ___
- [ ] Cenário Stage H: digitar texto formatado (negrito, lista, título) no editor de descrição; confirmar toolbar/formatação funcionam.
- [ ] Estados cobertos: loading (chip "uploading" por arquivo colado, reusando `PendingAttachmentChips`) | vazio (nenhum attachment ainda, editor mostra placeholder) | erro (toast de falha de upload ou de limite excedido)

### Step 4 (frontend — `apps/web`): Integrar o novo editor no `form-renderer.tsx` + levantar estado de additional attachment ids
- File: `apps/web/core/components/helpdesk/form-renderer.tsx`
- Action: modify
- What: Substituir o bloco `<textarea>` (linhas 57-67, casos `system_description`/`long_text`) pelo `HelpdeskDescriptionEditor` do Step 3. `FieldInput`/`HelpdeskFormRenderer` ganham uma nova prop `onAdditionalAttachmentIds?: (assetIds: string[]) => void`, repassada ao editor de descrição sem persistir estado local extra dentro do próprio `form-renderer` (Option A: o estado "vive" no componente pai que já faz `handleSubmit`).
- Copy from: bloco `case "attachment":` já existente (linhas 134-143) para o padrão de passagem de `attachmentTransport`
- Dependencies: Step 3
- ⚠️ Sem runner — validação: `pnpm --filter web check:types` → ___

### Step 4b (frontend — `apps/web`): Levantar estado e mesclar `asset_ids` no submit
- File: `apps/web/app/helpdesk/p/[publicSlug]/forms/[formSlug]/page.tsx`
- Action: modify
- What: Adicionar `const [additionalAttachmentIds, setAdditionalAttachmentIds] = useState<string[]>([])`; passar `onAdditionalAttachmentIds={setAdditionalAttachmentIds}` (ou callback que faz merge/dedup) para `HelpdeskFormRenderer`. Em `handleSubmit`, após agregar `asset_ids` dos campos `field_type === "attachment"` (linhas ~104-115), fazer merge com `additionalAttachmentIds` (dedup via `Set`) antes de `publicStore.submitPublicForm(...)`.
- Copy from: bloco de agregação de `asset_ids` já existente em `handleSubmit`
- Dependencies: Step 4
- ⚠️ Sem runner — validação: `pnpm --filter web check:types` → ___
- [ ] Cenário Stage H: preencher formulário público completo (título, descrição com texto formatado + 1 imagem colada + 1 PDF colado, e opcionalmente um campo `attachment` dedicado se o form tiver um configurado), submeter, e confirmar no painel do agente que o ticket criado tem TODOS os anexos listados (colados + campo dedicado) e a descrição renderiza o HTML corretamente.
- [ ] Estados cobertos: loading (botão "Submit Request" com `loading={submitting}`, já existente) | vazio (form sem nenhum attachment ainda) | erro (toast de erro já existente no catch de `handleSubmit`)

### Step 5 (backend — `apps/api`): Garantir `entity_type` explícito aceito e documentado no endpoint de credenciais
- File: `apps/api/plane/app/views/helpdesk/asset.py`
- Action: verify + modify se necessário
- What: `_validate_upload_payload` (linha 45-81) já aceita `entity_type` explícito no payload (`data.get("entity_type", COMMENT_ENTITY)`) e valida contra `HELPDESK_ENTITY_TYPES = [COMMENT_ENTITY, REQUEST_ENTITY]` (linha 60-61) — ou seja, o endpoint já suporta o caso de uso, NÃO precisa de mudança de código. O risco real está inteiramente no FRONTEND: se o Step 3/4 esquecer de passar `entity_type: "HELPDESK_REQUEST_ATTACHMENT"` explicitamente, o asset cai silenciosamente como `HELPDESK_COMMENT_ATTACHMENT` (default). Adicionar um comentário no código do backend (docstring de `_validate_upload_payload`) alertando que o default é `COMMENT_ENTITY` e que callers de formulário de request DEVEM passar `entity_type` explícito — nenhuma mudança funcional.
- Dependencies: nenhuma (pode rodar em paralelo aos steps de frontend)
- Test file: `apps/api/plane/tests/unit/helpdesk/test_helpdesk_attachments.py` (estender)
- Test cases (arquivo real usado: `plane/tests/contract/app/test_helpdesk.py::TestUploadCredentials` — endpoint HTTP completo, não só o helper unit; decisão tomada no Build por exercitar `HelpdeskAssetEndpoint.post` de ponta a ponta):
  - [x] RED: teste não existia antes deste step → escrito e rodado antes de qualquer mudança em `asset.py`.
  - [x] GREEN run: `3 passed, 11 warnings in 1.99s` (`test_defaults_to_comment_entity_when_unspecified`, `test_accepts_explicit_request_entity_type`, `test_rejects_unknown_entity_type` — este último adicionado além do plano, cobre payload de `entity_type` desconhecido).
  - [x] Anti-Laziness check: os 3 testes fazem `FileAsset.objects.get(id=asset_id)` e comparam `asset.entity_type` contra o enum exato (`HELPDESK_COMMENT_ATTACHMENT`/`HELPDESK_REQUEST_ATTACHMENT`), não apenas status 200.
  - Nota TDD: verify-only conforme o plano — nenhuma mudança funcional em `asset.py` (só docstring). O comportamento já era correto; os 3 testes passaram já na primeira execução (não há bug para expor com RED artificial). Documentado honestamente aqui em vez de forçar um RED falso.

### Step 6 (backend — `apps/api`): Sanitizar HTML de `HelpdeskRequest.description`
- File: `apps/api/plane/app/serializers/helpdesk.py` (`HelpdeskRequestSerializer`, em torno da linha 286-291, método `validate`)
- Action: modify
- What: Importar `validate_html_content` de `apps/api/plane/utils/content_validator.py`. Dentro de `validate(self, data)`, se `data.get("description")` estiver presente, chamar `is_valid, error_msg, sanitized_html = validate_html_content(data["description"])`; se `not is_valid`, `raise serializers.ValidationError({"description": error_msg})`; senão, se `sanitized_html` não for `None`, sobrescrever `data["description"] = sanitized_html`. Isso espelha exatamente `IssueSerializer` (`apps/api/plane/app/serializers/issue.py:136`), só que aplicado a `description` (TextField) em vez de `description_html`.
- Copy from: `apps/api/plane/app/serializers/issue.py:136` (chamada) — copiar a forma exata de erro e sobrescrita
- Dependencies: nenhuma (pode rodar em paralelo)
- Test file: `apps/api/plane/tests/unit/helpdesk/test_helpdesk_serializers.py` (estender — arquivo já existe)
- Test cases (classe real: `TestHelpdeskRequestDescriptionSanitization` em `test_helpdesk_serializers.py`):
  - [x] RED run: `2 failed, 1 passed` — `test_sanitizes_script_tag_in_description` FAIL (`AssertionError: '<script' unexpectedly found in "<p>hello</p><script>alert('xss')</script>"`), `test_rejects_oversized_description_html` FAIL (`AssertionError: True is not false` — serializer aceitava HTML de 10MB+1), `test_allows_plain_text_description_unchanged` PASSOU de cara (esperado — nada a sanitizar).
  - [x] GREEN: `cd apps/api && python -m pytest plane/tests/unit/helpdesk/test_helpdesk_serializers.py::TestHelpdeskRequestDescriptionSanitization` → `3 passed, 7 warnings in 2.82s`
  - [x] Anti-Laziness check: `test_sanitizes_script_tag_in_description` faz `self.assertNotIn("<script", instance.description)` no objeto persistido (via `serializer.save()`), não só status; `test_rejects_oversized_description_html` confirma 400 com `description` na chave de erro.
  - Regressão: suíte completa `plane/tests/unit/helpdesk/` → `93 passed, 36 subtests passed` (sem quebra em nenhum teste pré-existente).

### Step 7 (frontend — `apps/web`, verificação): Confirmar campo de anexo dedicado (HELPDESK-38, segunda metade)
- File: nenhum arquivo novo — `field_type: "attachment"` já renderiza `AttachmentFieldInput` (`form-renderer.tsx`, linhas 134-143 e 149-200), já usa `attachmentTransport`.
- Action: verify only — SEM mudança de código, EXCETO se Step 4/4b alterar a assinatura de `HelpdeskFormRenderer`/`FieldRendererProps` de um jeito que quebre esse caminho (validar via `check:types`).
- Dependencies: Step 4, 4b
- [ ] Cenário Stage H: em um formulário configurado com um campo `field_type: "attachment"` dedicado, anexar um arquivo por lá (fluxo já existente) e confirmar que continua funcionando lado a lado com os anexos vindos do paste no editor de descrição — sem duplicação, sem sobrescrita.

### Step 8 (backend — `apps/api`, teste de isolamento): Cross-workspace e teste negativo do fluxo completo
- File: `apps/api/plane/tests/unit/helpdesk/test_helpdesk_attachments.py` ou `apps/api/plane/tests/contract/app/test_helpdesk.py` (o mais adequado dependendo se o teste exercita só `bind_assets` ou o endpoint HTTP completo — decidir no Build ao ver o teste já existente com mais contexto)
- Action: create/modify (novos test cases)
- What: Cobrir explicitamente: (a) um asset com `entity_type=HELPDESK_REQUEST_ATTACHMENT` de outro workspace NÃO pode ser reivindicado por `bind_assets` de um request de workspace diferente (já coberto por `TestBindAssets.test_refuses_asset_from_another_workspace` — confirmar que cobre o novo caminho também, ou adicionar caso específico); (b) caminho negativo: `description` com HTML que excede `MAX_SIZE` (10MB) é rejeitado com 400, não 500; (c) caminho negativo: mais de `HELPDESK_MAX_ATTACHMENTS_PER_COMMENT` asset_ids agregados no submit são truncados/rejeitados de forma previsível pelo `bind_assets` existente (já trunca via slice, confirmar com teste explícito).
- Dependencies: Steps 5, 6
- [x] GREEN run: `cd apps/api && python -m pytest plane/tests/unit/helpdesk/test_helpdesk_attachments.py::TestBindAssets::test_request_attachment_isolated_cross_workspace` → `1 passed, 6 warnings in 1.93s`
- [x] Anti-Laziness check: usa `self.workspace`/`self.other_workspace` (dois workspaces reais via `WorkspaceFactory`, do `setUp` já existente), pré-condição explícita (`assertIsNone(asset.entity_identifier)` antes do bind), leitura nova pós-mutação (`asset.refresh_from_db()`).
- Nota TDD: verify-only — `bind_assets` já filtra por `workspace_id` independente de `entity_type`, então o teste passou na primeira execução (mesmo padrão de Step 5: nenhum bug a expor, comportamento correto documentado e travado por teste). Item (b) do plano (description HTML >10MB → 400) já coberto por Step 6 (`test_rejects_oversized_description_html`). Item (c) (truncamento acima de `HELPDESK_MAX_ATTACHMENTS_PER_COMMENT`) já coberto pelo teste pré-existente `TestBindAssets.test_caps_the_number_of_attachments` — confirmado que cobre o caso, nenhum teste novo necessário ali.
- Suíte completa `test_helpdesk_attachments.py`: `16 passed, 35 warnings in 11.32s`.

## Frontend Component Reuse Plan
- `AttachmentPicker`, `PendingAttachmentChips`, `useAttachmentUpload` — reusados sem nenhuma mudança.
- `RichTextEditorWithRef` (`@plane/editor`) — reusado como motor de edição; só o WRAPPER é novo (`description-editor.tsx`), seguindo o padrão já estabelecido de "um wrapper fino por superfície de autenticação" (`apps/web` autenticado vs `apps/space`/Helpdesk público).
- Nenhum novo componente de UI genérico é necessário além do wrapper do editor — orçamento de criação: 1 arquivo novo em `apps/web` (`description-editor.tsx`), dentro do limite de bom senso do skill de review (≤3 arquivos novos por página/fluxo).

## Migration Plan
N/A — nenhuma migration necessária nesta feature.

## Testing Strategy Summary
- Backend (`apps/api`, pytest, RED→GREEN obrigatório): Steps 5, 6, 8 — sanitização de HTML, entity_type explícito, isolamento cross-workspace, tamanho máximo de HTML.
- Frontend (`apps/web`, `packages/editor`): sem runner — validação via `check:types` em ambos os packages + cenários de browser no Stage H (listados em cada step acima).

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Frontend esquecer de passar `entity_type: "HELPDESK_REQUEST_ATTACHMENT"` explícito | Alto — anexos do formulário viram silenciosamente `HELPDESK_COMMENT_ATTACHMENT`, corrompendo a listagem de anexos do ticket sem erro visível | Step 5 documenta o contrato no backend; Step 3/4 centralizam a chamada num único wrapper (`description-editor.tsx`) para minimizar pontos de esquecimento; Step 8 adiciona teste que falha se o entity_type errado for usado |
| HTML malicioso em `description` sem sanitização | Alto — XSS no painel do agente ou em outbound email se `description` for renderizada sem escape | Step 6 (obrigatório, bloqueador de Phase 3) |
| Editor autenticado (`apps/web/core/components/editor/rich-text/editor.tsx`) reusado por engano na superfície pública | Alto — quebra em runtime por falta de sessão de workspace member | Step 3 usa explicitamente o padrão `apps/space` (sem hooks autenticados), não o wrapper de `apps/web/core/components/editor/rich-text/` |
| Abuso de upload paralelo via paste múltiplo no portal público sem autenticação | Médio | Limite de 5 arquivos por operação de paste/drop no editor (Step 3) + teto de servidor já existente `HELPDESK_MAX_ATTACHMENTS_PER_COMMENT` |
| `packages/editor` sem test runner — risco de regressão silenciosa na lógica de `insertFilesSafely` | Médio | `check:types` + cenário de browser explícito no Stage H cobrindo paste de imagem E de arquivo genérico |

## Out-of-scope observation (NÃO é um step deste plano)
`apps/api/plane/bgtasks/helpdesk_email_task.py:147` renderiza `comment.content` em HTML de email sem escape — bug pré-existente, no fluxo de COMENTÁRIOS (não no fluxo de `description` de ticket que esta feature toca). Não incluído como step (Rule 25 — bug pré-existente fora da área modificada). Candidato a `spawn_task` separado.
