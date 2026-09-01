# Stage A: Plan Complete

Tickets: HELPDESK-38, HELPDESK-41, HELPDESK-47 (projeto IT System) — tratados como uma única
feature: "Editor rich text com suporte a anexos (incluindo paste-to-attachment) no formulário de
ticket do Helpdesk".

- Steps: 10 (Step 1-3 packages/editor + apps/web novo wrapper; Step 4/4b integração + estado
  levantado; Step 5/6/8 backend com TDD RED/GREEN; Step 7 verificação frontend)
- Link: `SESSION_DIR/final-plan.md`

## Files to create
- `apps/web/core/components/helpdesk/description-editor.tsx` — wrapper de `RichTextEditorWithRef`
  sem hooks autenticados de workspace (molde: `apps/space/components/editor/rich-text-editor.tsx`
  + `apps/space/helpers/editor.helper.ts`)

## Files to modify
- `packages/editor/src/core/plugins/drop.ts` — implementa branch `fileType === "attachment"`
  (hoje vazio) + `treatImagesAsAttachments`
- `packages/editor/src/core/types/editor.ts` (`IRichTextEditorProps`, linha 189) — novas props
  `onAttachmentFile`, `treatImagesAsAttachments`
- `apps/web/core/components/helpdesk/form-renderer.tsx` — troca textarea por
  `HelpdeskDescriptionEditor`
- `apps/web/app/helpdesk/p/[publicSlug]/forms/[formSlug]/page.tsx` — estado levantado
  `additionalAttachmentIds` + merge no `handleSubmit`
- `apps/api/plane/app/serializers/helpdesk.py` (`HelpdeskRequestSerializer`) — sanitização de
  HTML via `validate_html_content()` (BLOCKER da revisão, obrigatório)
- `apps/api/plane/app/views/helpdesk/asset.py` — apenas docstring/comentário (default
  `entity_type=COMMENT_ENTITY` confirmado, sem mudança funcional; risco mitigado no frontend)

## Key decisions
1. Sem migration — `HelpdeskRequest.description` (TextField) guarda o HTML direto.
2. Sem extensão TipTap de attachment — arquivo colado/arrastado no editor do Helpdesk NUNCA é
   inserido no corpo HTML; sempre vira attachment via callback, fora do conteúdo rico.
3. Imagem colada no editor do Helpdesk também vira attachment (não fica embutida inline, ao
   contrário do editor de descrição do Issue) — via `treatImagesAsAttachments: true`.
4. `entity_type: "HELPDESK_REQUEST_ATTACHMENT"` deve ser SEMPRE explícito nas chamadas de upload
   originadas do formulário de ticket — o default do endpoint é `COMMENT_ENTITY` (bug de dado
   silencioso se esquecido). Ver BLOCKER na seção "Review Changes Applied" do final-plan.md.
5. Agregação de asset_ids do editor de descrição via Option A: callback
   `onAdditionalAttachmentIds` + estado levantado em `page.tsx`, merge no submit.
6. Sanitização de HTML obrigatória em `HelpdeskRequestSerializer` via `validate_html_content()`
   (nh3), espelhando `IssueSerializer` — BLOCKER de segurança da revisão Phase 3.
7. Limite de 5 arquivos por operação de paste/drop no editor (consistente com o campo de anexo
   dedicado); backend já protege via `HELPDESK_MAX_ATTACHMENTS_PER_COMMENT`.
8. `packages/editor` não tem test runner — validação via `check:types` + browser (Stage H), sem
   RED/GREEN nessa camada.

## Risks
- Frontend esquecer `entity_type` explícito → anexos marcados incorretamente como
  `HELPDESK_COMMENT_ATTACHMENT` (mitigado: centralizado no wrapper único do Step 3 + teste no
  Step 8).
- HTML malicioso sem sanitização (mitigado: Step 6, bloqueador).
- Reuso indevido do editor autenticado (`apps/web/core/components/editor/rich-text/editor.tsx`)
  na superfície pública quebraria em runtime — mitigado usando o padrão `apps/space` como molde.
- Abuso de upload paralelo no portal público sem auth (mitigado: limite de 5 por paste + teto de
  servidor já existente).
- Fora de escopo, documentado: `apps/api/plane/bgtasks/helpdesk_email_task.py:147` renderiza
  `comment.content` em email HTML sem sanitização — bug pré-existente no fluxo de COMENTÁRIOS, não
  tocado por esta feature. Registrado via spawn_task (task_47403c8e), não corrigido aqui.
