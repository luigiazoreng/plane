# Task Classification
- Type: Full-stack feature
- Stage A (Plan): ✅ All 4 phases
- Stage B (Build): ✅
- Stage C (Harden): ✅
- Stage D (Review): ✅ (always mandatory)
- Stage E (Validate): ✅ (always mandatory)
- Spec/Requirements Document: none (compilado a partir de 3 tickets do Plane: HELPDESK-38, HELPDESK-41, HELPDESK-47 — projeto IT System)
- Notes:
  - Feature composta de 3 tickets tratados como uma única entrega coesa: editor rich text no campo
    "descrição" do formulário de ticket do TI (HELPDESK-41), campo de anexo dedicado + suporte a
    anexar arquivos via editor (HELPDESK-38, UX de referência: ERPNext), e conversão automática de
    paste (imagem/arquivo) em attachment do ticket em vez de embutir como base64/blob (HELPDESK-47).
  - Provavelmente full-stack: frontend (componente de formulário do Helpdesk) + possível trabalho
    de backend (endpoint/model de attachment do ticket) — a confirmar no Phase 1.
  - Área de produto: formulário de criação/edição de ticket do módulo Helpdesk. Localização exata
    do app (apps/web vs apps/space vs app dedicado de helpdesk) a mapear no Phase 1.
