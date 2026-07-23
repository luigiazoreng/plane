---
name: frontend-design
description: Qualidade de UI no Plane (apps/web, admin, space) — auditoria de reuso em packages/ui, design system semântico Canvas/Surface/Layer, estados obrigatórios de loading/vazio/erro, e os anti-padrões de layout que mais quebram entrega. OBRIGATÓRIO para qualquer task que crie ou modifique componente ou página React.
---

# Frontend Design & Reuso de Componentes

Garante UI polida **na primeira entrega**, reusando o que já existe em vez de reinventar.

> **Estado e dados**: skill `mobx-swr-patterns`. **Comandos**: `.claude/instructions/stack.md`.
> ⛔ Não há jest, vitest, Playwright nem visual-audit nestes apps. Validação é
> `pnpm --filter <app> check:types` + verificação no browser (Stage UX).

Obrigatória quando a task: cria página/componente em `apps/web|admin|space`, refaz layout ou UX
de tela existente, ou adiciona modal, lista, filtro, tabela ou formulário.

## 1. Auditoria de reuso (antes de criar qualquer componente)

**Passo 1 — procure em `packages/ui` primeiro.** Exportado de `@plane/ui`:

`Avatar` · `Badge` · `Breadcrumbs` · `Button` · `Card` · `Collapsible` · `ColorPicker` ·
`ContentWrapper` · `ControlLink` · `DragHandle` · `DropIndicator` · `Dropdown(s)` ·
`FavoriteStar` · `FormFields` · `Header` · `Link` · `Loader` · `Modals` · `Popovers` ·
`Progress` · `Row` · `ScrollArea` · `Sortable` · `Spinners` · `Tables` · `Tabs` · `Tag` ·
`Tooltip` · `Typography`

Variantes de `Button`: `primary`, `accent-primary`, `outline-primary`, `neutral-primary`,
`link-primary`, `link-neutral`, `danger`, `link-danger`, `tertiary-danger`.

```bash
ls packages/ui/src/                                  # inventário
grep -rn 'from "@plane/ui"' apps/web/core/components/<área> | head   # como telas parecidas usam
```

**Passo 2 — procure em `apps/web/core/components/`.** Provavelmente já existe um componente de
domínio para a entidade (issue, cycle, module, project, helpdesk).

**Passo 3 — árvore de decisão:**

| Situação | Ação |
|---|---|
| Existe componente que resolve | **Use.** Não crie variante |
| Existe e falta uma variação | **Adicione uma prop** ao existente |
| Sobreposição ≥70% com um existente | **Estenda o existente** — criar novo é retrabalho |
| Nada parecido | Crie — no diretório e no padrão dos vizinhos |

Componente genérico e reusável nasce em `packages/ui`; componente de domínio, em
`apps/web/core/components/`.

## 2. Design system — Canvas / Surface / Layer

O guia canônico é **`packages/tailwind-config/AGENTS.md`**. Leia-o antes de escolher classe de
fundo ou borda. Resumo operacional:

- **`bg-canvas`** — fundo da aplicação. Aparece **uma vez**, na raiz. ⛔ Nunca em página, card,
  modal, sidebar ou container aninhado.
- **`bg-surface-1|2|3`** — superfície de página/painel. `surface-1` é o caso comum.
- **`bg-layer-1|2|3`** — elemento aninhado **dentro** de uma surface. Pareamento direto: dentro
  de `surface-1` use `layer-1`; dentro de `surface-2`, `layer-2`.
- Hover tem token próprio: `hover:bg-layer-1-hover`.
- Bordas: `border-subtle` e afins — não invente valor.

⛔ **Nunca hardcode cor** (`#fff`, `bg-gray-800`, `text-[#333]`). O sistema tem tema claro/escuro;
cor fixa quebra num deles. Rótulos coloridos têm tokens próprios (`--color-label-*`).

## 3. Estados obrigatórios em toda tela que carrega dado

Três, sempre. Entregar só o caminho feliz é entrega incompleta.

```tsx
if (data === undefined) return <Loader />;      // ainda carregando
if (data.length === 0) return <EmptyState />;   // carregado e vazio
// erro: tratar rejeição do fetch com mensagem acionável
```

O `undefined` vs `[]` vem do `fetchedMap` do store — ver `mobx-swr-patterns`. Confundir os dois
gera spinner infinito ou "vazio" falso enquanto carrega.

Empty state útil diz **o que fazer**, não só "Nenhum resultado".

## 4. Responsividade

1. **Mobile-first**: base sem prefixo, depois `sm:` `md:` `lg:` `xl:`
2. Alvos de toque ≥ 44×44px
3. `overflow-x-hidden` no container principal — a página nunca rola na horizontal
4. Grid responsivo (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), não colunas fixas
5. Texto longo trunca (`truncate` / `line-clamp-[N]`)
6. Input em mobile: `w-full`
7. Modal em mobile ocupa quase a tela inteira

## 5. Anti-padrões de layout

### 5.1 Espremer 3+ campos numa linha (o bug de layout mais comum)

Com 3+ campos de largura fixa mais um `flex-1`, o último vira uma fatia inutilizável em container
estreito. O usuário literalmente não consegue usar o campo.

```
❌ <div className="flex gap-2">
     <input className="w-28 ..." />      ← 7rem fixos
     <select className="w-24 ..." />     ← 6rem fixos
     <input className="flex-1 ..." />    ← sobra ~50px — INUTILIZÁVEL
   </div>

✅ Empilhe: linha de cima com os curtos + ações, linha de baixo com o campo largo
   <div className="space-y-2">
     <div className="flex gap-2 items-center">
       <input className="flex-1 ..." /><select className="w-28 ..." /><button/>
     </div>
     <input className="w-full ..." />
   </div>
```

**Regra**: linha com ≥3 campos precisa ser conferida na largura real da tela. Se algum campo
ficaria abaixo de ~120px, empilhe. Pense em **orçamento de largura**: os fixos consomem valor
fixo, o `flex-1` fica com o resto — se o resto é pequeno, o design está quebrado.

### 5.2 Coluna condicional de grid sem template correspondente

Se uma coluna é renderizada condicionalmente (`{cond && <div/>}`), o `grid-cols-*` **também**
precisa ser condicional — senão as células deslizam para as trilhas erradas.

```
❌ template fixo com filho condicional → colunas desalinhadas
❌ [&>*:first-child]:hidden para "remover" coluna → esconde o filho errado

✅ <div className={cond ? "grid grid-cols-[5rem_1fr_1fr_2rem]" : "grid grid-cols-[1fr_1fr_2rem]"}>
```

Cabeçalho e linhas de dados usam **o mesmo** template — extraia para uma variável. Verifique as
duas variantes.

### 5.3 `w-full` combinado com `flex-1` ou `w-NN` (bug silencioso)

Tailwind **não** resolve conflito pela ordem no atributo `className` — vence quem aparece depois
no CSS gerado, e na prática `w-full` ganha. Então `w-44` e `flex-1` viram código morto.

```
❌ const inputClass = "w-full px-2.5 py-2 ...";
   <input  className={`flex-1 ${inputClass}`} />   ← flex-1 ignorado
   <select className={`w-44 ${inputClass}`} />     ← w-44 ignorado, esmaga o irmão

✅ base sem largura; largura aplicada separadamente
   const rowInputClass = "px-2.5 py-2 ...";
   <input className={`flex-1 ${rowInputClass}`} />
```

Passa despercebido em revisão porque o DOM e os handlers estão corretos — só quebra visualmente.
Constante compartilhada com `w-full` serve apenas para input isolado de largura total.

### 5.4 Outros

- **Proliferação de componente** — variante nova que difere por uma prop deve ser uma prop
- **Sem `observer`** em componente que lê store MobX — não re-renderiza
- **Modal fora do padrão** — use os de `@plane/ui`, não monte overlay na mão
- **Ícone inconsistente** — siga a biblioteca usada nas telas vizinhas

## 6. Checklist de página nova

- [ ] Auditoria de reuso feita: `packages/ui` e `core/components/` verificados
- [ ] Sem cor hardcoded; Canvas/Surface/Layer conforme `packages/tailwind-config/AGENTS.md`
- [ ] Loading, vazio e erro tratados — e o vazio diz o que fazer
- [ ] Componente que lê store é `observer`
- [ ] Responsivo: sem scroll horizontal, alvos ≥44px, grid que quebra
- [ ] Nenhum dos anti-padrões 5.1–5.3
- [ ] Rota registrada em `apps/web/app/routes/core.ts`
- [ ] `pnpm --filter <app> check:types` e `check:lint` passando
- [ ] Cenário de browser escrito para o Stage UX (é o que substitui teste automatizado aqui)

## 7. Checklist de modificação de componente existente

- [ ] Todos os usos atuais localizados (`grep -rn "<Componente" apps/`)
- [ ] Prop nova é opcional com default — não quebra chamador existente
- [ ] Os usos existentes continuam corretos visualmente
- [ ] Mudou algo em `packages/ui`? verifique `web`, `admin` **e** `space`
