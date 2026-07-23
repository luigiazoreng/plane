---
name: mobx-swr-patterns
description: Padrões de estado do frontend Plane (apps/web, admin, space) — stores MobX com makeObservable/computedFn, root store, services e fetch via SWR. Leia ANTES de criar ou modificar qualquer store, service ou componente que consome dados.
---

# MobX & SWR — `apps/web`, `apps/admin`, `apps/space`

> Stack: React Router v7 + **MobX** (`mobx`, `mobx-react`, `mobx-utils`) + **SWR**.
> ⛔ Não existe Redux, Redux Toolkit, Zustand nem Context como store global neste repo.
> ⛔ Não existe runner de teste nestes apps — validação é `check:types` + browser (`stack.md`).

## Anatomia de um store

Padrão real (`apps/web/core/store/label.store.ts`): interface exportada + classe que a implementa.

```ts
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import { set } from "lodash-es";
import type { IMyEntity } from "@plane/types";
import { MyEntityService } from "@/services/my-entity";
import type { CoreRootStore } from "./root.store";

export interface IMyEntityStore {
  entityMap: Record<string, IMyEntity>;
  fetchedMap: Record<string, boolean>;
  projectEntities: IMyEntity[] | undefined;
  getEntityById: (id: string) => IMyEntity | null;
  fetchEntities: (workspaceSlug: string, projectId: string) => Promise<IMyEntity[]>;
  createEntity: (workspaceSlug: string, projectId: string, data: Partial<IMyEntity>) => Promise<IMyEntity>;
}

export class MyEntityStore implements IMyEntityStore {
  entityMap: Record<string, IMyEntity> = {};
  fetchedMap: Record<string, boolean> = {};
  rootStore;
  myEntityService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      entityMap: observable,
      fetchedMap: observable,
      projectEntities: computed,
      fetchEntities: action,
      createEntity: action,
    });
    this.rootStore = _rootStore;
    this.myEntityService = new MyEntityService();
  }

  get projectEntities() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return undefined;
    return Object.values(this.entityMap).filter((e) => e.project_id === projectId);
  }

  getEntityById = computedFn((id: string) => this.entityMap[id] ?? null);

  fetchEntities = async (workspaceSlug: string, projectId: string) => {
    const response = await this.myEntityService.getAll(workspaceSlug, projectId);
    runInAction(() => {
      response.forEach((entity) => set(this.entityMap, [entity.id], entity));
      set(this.fetchedMap, projectId, true);
    });
    return response;
  };
}
```

Regras que o padrão codifica:
- **Normalize por id** (`Record<string, T>`), não array. Listas derivadas vêm de `computed`.
- **`fetchedMap`** distingue "ainda não buscado" (`undefined`) de "buscado e vazio" (`[]`) — é o
  que evita spinner infinito e re-fetch em loop.
- **Toda mutação de observable dentro de `runInAction`** quando vem depois de um `await`.
- **`computedFn`** para getter parametrizado; `computed` puro não aceita argumento.
- Store novo é registrado no `root.store.ts`; acesso cruzado é via `this.rootStore.<outro>`.
- Store fala com a API só através de um **service** (`@/services/...`) — nunca `fetch`/`axios` direto.

## Componentes

```tsx
import { observer } from "mobx-react";
import { useMyEntity } from "@/hooks/store";

export const MyList = observer(() => {
  const { projectEntities, fetchEntities } = useMyEntity();
  if (projectEntities === undefined) return <Loader />;   // ainda carregando
  if (projectEntities.length === 0) return <EmptyState />; // carregado e vazio
  return <>{projectEntities.map((e) => <Row key={e.id} entity={e} />)}</>;
});
```

- Componente que lê observable **precisa** de `observer`. Sem isso não re-renderiza — é a causa
  nº 1 de "mudei o store e a tela não atualizou".
- Desestruturar observable fora do `observer` quebra a reatividade; leia dentro do render.
- Sempre trate os três estados: carregando (`undefined`), vazio, com dados.

## SWR

Usado para disparar e revalidar o fetch; o **dado canônico continua no store**.

```ts
useSWR(
  workspaceSlug && projectId ? `MY_ENTITIES_${workspaceSlug}_${projectId}` : null,
  workspaceSlug && projectId ? () => fetchEntities(workspaceSlug, projectId) : null
);
```

- Chave `null` desabilita o fetch — é assim que se espera por params de rota.
- Chave inclui **todos** os params que mudam o resultado, senão volta dado de outro projeto.

## Checklist antes de fechar

- [ ] Observables declarados em `makeObservable`; ações marcadas como `action`
- [ ] Mutação pós-`await` dentro de `runInAction`
- [ ] `fetchedMap` distinguindo não-buscado de vazio
- [ ] Componente que lê store é `observer`
- [ ] Chamada de API isolada num service
- [ ] Chave SWR completa e `null` enquanto faltam params
- [ ] Estados de loading / empty / error cobertos na UI
- [ ] `pnpm --filter <app> check:types` passa
