# Kanban (e demais layouts) renderizando vazio (Bug resolvido)

**Data:** 2026-06-16
**Branch:** dev-1.3.1
**Severidade:** Alta — board/list/calendar de work items ficavam vazios; `Uncaught (in promise) CanceledError: canceled` no console.

---

## Sintoma

Ao abrir um projeto e selecionar o layout **board (kanban)** ou alternar entre views de forma sutil, a área de work items ficava
completamente vazia, mesmo havendo issues. O console mostrava:

```
Uncaught (in promise) CanceledError: canceled
```

Os dados **chegavam do servidor** (`totalCount: 10`, resposta agrupada nas chaves corretas), mas a UI
renderizava a tela em branco, sem apresentar os swimlanes ou colunas de issues.

## Diagnóstico

A instrumentação de depuração revelou uma contradição decisiva: num mesmo instante, componentes diferentes divergiam no estado dos filtros.

- `[LayoutRootDebug]` → `activeLayout: "kanban"` ✅
- `[FilterStoreDebug] getAppliedFilters` → `layout: "kanban"`, params OK ✅
- **MAS** `[KanbanDebug] root:render` → `hasIssueFilters: false`, `displayFilters: undefined`, `layout: undefined` ❌

Ou seja, **o mesmo filter store** retornava o layout correto para alguns consumidores e
`undefined` para o Kanban. A diferença estava em **como** cada um acessava os filtros:

- O `ProjectLayoutRoot` usa `issuesFilter.getIssueFilters(projectId)` — ele passa o `projectId` explícito (lido de forma síncrona/segura a partir da URL).
- O Kanban usa um getter (`issuesFilter.issueFilters`), que depende da variável reativa `rootIssueStore.projectId`:

  ```ts
  // apps/web/core/store/issue/project/filter.store.ts
  get issueFilters() {
    const projectId = this.rootIssueStore.projectId; // <- estava undefined!
    if (!projectId) return undefined;
    return this.getIssueFilters(projectId);
  }
  ```

### Causa Raiz: MobX Untracked Dependencies

Por que `rootIssueStore.projectId` estava vazio se a URL possuía o ID do projeto e a navegação funcionava?

O valor de `rootIssueStore.projectId` é alimentado automaticamente por um `autorun` que copia dados vindos de `rootStore.router.projectId` (que é gerido pelo router global `RouterStore` via sincronização com `useParams`).

Contudo, havia uma **"armadilha" arquitetural no MobX** implementada na declaração desse `autorun`:

```ts
// Código com o BUG (antes da correção)
autorun(() => {
  runInAction(() => { // <--- O ERRO ESTAVA AQUI: Leitura dentro da action
    if (this.workspaceSlug !== rootStore.router.workspaceSlug) this.workspaceSlug = rootStore.router.workspaceSlug;
    if (this.projectId !== rootStore.router.projectId) this.projectId = rootStore.router.projectId;
    // ...
  });
});
```

No MobX, **todas as leituras de variáveis observáveis feitas *dentro* de um bloco `runInAction` (ou qualquer `@action`) são ignoradas (untracked)**. A engine de reatividade entende que actions servem para mutar dados, não derivá-los. 

Como *todas* as variáveis do sistema (como `rootStore.router.projectId`) estavam sendo lidas dentro desse `runInAction`, o MobX concluía que esse `autorun` **não possuía nenhuma dependência**. 

Resultado dessa quebra de reatividade:
O `autorun` rodava uma única vez no instante de boot da aplicação (quando `RouterStore` ainda não tinha processado os params da URL e `projectId = undefined`), e **nunca mais executava**. Mesmo que a URL mudasse e o `RouterStore` fosse atualizado dezenas de vezes, o `IssueRootStore` ficava congelado com `projectId = undefined`.

Consequentemente, em cascata:
1. `RouterStore.projectId` = "1f35..." (Sincronizado via `StoreWrapper`)
2. `IssueRootStore.projectId` = `undefined` (Travado para sempre)
3. `getter issuesFilter.issueFilters` = `undefined`
4. Kanban assumia que não existiam filtros ativos, o que zerava suas propriedades obrigatórias de colunas e grupos, forçando uma tela vazia.

## Correção Definitiva

A solução foi refatorar o `autorun` do arquivo raiz das issues (`IssueRootStore.ts`), para **ler** as dependências essenciais do MobX de forma exposta antes de acionar as modificações na State via `runInAction`. Dessa forma, o MobX cria corretamente a inscrição de atualizações (subscriptions).

```ts
// apps/web/core/store/issue/root.store.ts
autorun(() => {
  // 1. Rastrear dependências FORA do runInAction
  const workspaceSlug = rootStore.router.workspaceSlug;
  const projectId = rootStore.router.projectId;
  // ... (outras dependências rastreadas da mesma forma)

  // 2. Mutações e condicionais seguras DENTRO da action
  runInAction(() => {
    if (this.workspaceSlug !== workspaceSlug) this.workspaceSlug = workspaceSlug;
    if (this.projectId !== projectId) this.projectId = projectId;
    // ...
  });
});
```

### Arquivos Modificados

- `apps/web/core/store/issue/root.store.ts` (Correção drástica do Untracked Autorun).
- `apps/web/core/lib/wrappers/store-wrapper.tsx` (Removida e revertida a tentativa de usar lógicas síncronas/loop que agiam apenas para contornar ou acobertar a falta de reatividade das Stores).

## Observações / Dívidas Técnicas

- **CanceledError:** O `Uncaught (in promise) CanceledError: canceled` no Axios é apenas uma consequência cosmética do React abortando as requests antigas no momento da transição de layouts com novos filtros. 
- **Anti-Pattern Untracked:** Uma varredura no código (`grep_search`) revelou a existência de dezenas de outros `autorun` usando a exata mesma falha pelo sistema do Workspace (ex: `modules-timeline.store.ts`, `issues-timeline.store.ts`, etc). Esses arquivos carregam bombas relógio ocultas que irão quebrar telas complexas se a URL sofrer mudanças dinâmicas na frente do usuário, e devem ser refatorados prioritariamente para o formato corrigido.
