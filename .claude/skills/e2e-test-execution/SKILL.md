---
name: e2e-test-execution
description: 'Execute E2E tests via Browser MCP and API harness. Delegate browser tests to gem-browser-tester subagent. Document all failures with structured evidence. Applies to Phase 9 (validation) and Phase 12 (UX browser testing) of the feature workflow.'
---

# E2E Test Execution — Agents4Chat

## Overview

Executa o plano de testes E2E para o projeto agents4chat. Delega testes de browser ao subagente `gem-browser-tester`. Roda testes de API diretamente (Jest). Documenta todas as falhas com evidências.

## Quando Usar

- **Phase 9** (Validação pós-review): após a fase de review independente.
- **Phase 12** (UX Browser Testing opcional): quando o dev solicita testes de experiência do usuário via browser ao final do ciclo.

---

## Step 0: Verificar Ambiente de Dev

Antes de qualquer teste, verifique se o ambiente está rodando.

### 0a. Verificar credenciais de teste

Leia `SESSION_DIR/ux-test-credentials.md` para obter credenciais de teste.

Se não existir, execute o **Feature - Seed** agent (Stage H-Seed) para criar dados de teste.

### 0b. Verificar Docker em execução

```powershell
$dockerStatus = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker não está rodando. Tentando iniciar..."
}
```

**Se o Docker NÃO estiver rodando**, tente iniciar automaticamente:

```powershell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
$maxWait = 60; $waited = 0
do {
    Start-Sleep -Seconds 5; $waited += 5
    $ok = (docker info 2>&1 | Select-String "Server Version") -ne $null
} while (-not $ok -and $waited -lt $maxWait)
```

Se após a tentativa automática o Docker **ainda não estiver respondendo**, use `vscode/askQuestions` para pedir ao dev.

Em seguida, suba os containers:

```powershell
docker compose -f assistant-api/docker-compose.yml up -d
docker compose -f account-api/docker-compose.yml up -d
docker compose -f channel-api/docker-compose.yml up -d
```

### 0c. Verificar serviços rodando

```powershell
# assistant-api (porta 3000)
$api = (Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -ErrorAction SilentlyContinue).StatusCode
# assistant-front (porta 5173)
$front = (Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -ErrorAction SilentlyContinue).StatusCode
Write-Host "API: $api | Frontend: $front"
```

Se algum serviço não estiver rodando:

| Serviço | Porta | Como iniciar |
|---|---|---|
| **assistant-api** | 3000 | `npm --prefix assistant-api run dev` |
| **assistant-front** | 5173 | `npm --prefix assistant-front run dev` |
| **account-api** | 3002 | `npm --prefix account-api run dev` |
| **channel-api** | 3001 | `npm --prefix channel-api run dev` |

**NUNCA prossiga com testes se os serviços não estiverem respondendo.**

### 0d. Extrair credenciais

Leia `SESSION_DIR/ux-test-credentials.md` e monte o mapa de credenciais:

```
ACCOUNT:
  - Account ID: <uuid>
  - URL Frontend: http://localhost:5173

OWNER:
  - Email: <email_admin>
  - Senha: <senha_admin>
```

---

## Step 1: Carregar o Plano de Testes

Para **Phase 9**: leia o plano de testes em `SESSION_DIR/`.

Para **Phase 12 (UX Browser Testing)**: leia os testes E2E existentes em `assistant-front/e2e/` para entender o que já é testado e identificar gaps.

```powershell
Get-ChildItem -Path "assistant-front\e2e" -Filter "*.spec.*" | Select-Object Name
```

---

## Step 2: Rodar Testes de API (Jest)

Para testes de API nos serviços backend:

```powershell
cd assistant-api
npx jest tests/path/to/test.file.test.ts --runInBand
```

Registre o resultado por cenário.

---

## Step 3: Rodar Testes de Browser via Subagente

**NUNCA execute ferramentas de Browser MCP diretamente nesta skill.** Delegue ao `gem-browser-tester`.

### Preparar o prompt para o subagente

Antes de delegar, monte um prompt completo contendo:

1. **Credenciais**:
   ```
   URL Base: http://localhost:5173
   Owner: email=<email>, senha=<senha>
   ```

2. **Cenários a testar**:
   ```
   Cenário 1: Login
   - Navegar para: http://localhost:5173
   - Preencher email e senha
   - Verificar: dashboard carregado
   - Screenshot: login-success.png
   ```

3. **Instrução de evidência**:
   ```
   Para cada cenário:
   1. Navegar para a URL
   2. Aguardar carregamento
   3. Executar steps de interação
   4. Tirar screenshot do resultado
   5. Verificar resultado esperado
   6. Em caso de FALHA: screenshot + console messages como evidência
   ```

### Chamar o gem-browser-tester

```
Subagente: gem-browser-tester
Prompt: [prompt montado acima]
```

---

## Step 4: Compilar Resultados

```markdown
| Cenário | Tipo | Status | Erro | Evidência |
|---|---|---|---|---|
| Login | Browser | PASS/FAIL | [msg ou -] | [caminho ou -] |
```

---

## Step 5: Gaps de Cobertura (Phase 12 apenas)

Para cada funcionalidade implementada nesta tarefa, verifique se existe teste E2E correspondente em `assistant-front/e2e/`. Se não existir, adicione o gap ao plano.

---

## Step 6: Salvar em Session Memory

Salvar em `SESSION_DIR/phase9-e2e-results.md` (Phase 9) ou `SESSION_DIR/phase12-ux-results.md` (Phase 12):
- Tabela completa de resultados
- Lista de falhas que precisam de correção
- Caminhos das evidências (screenshots, logs)
- Gaps de cobertura identificados e ações tomadas

---

## Output Format

```
### Phase [9|12] Output
- Status: PASS | NEEDS_FIX | BLOCKED
- Testes passados: N / total
- Testes falhos: N
- Screenshots salvos em: [pasta]
- Gaps cobertos: N novos testes E2E adicionados
- Session memory: .claude/memories/session/phase[9|12]-[e2e-results|ux-results].md
```

---

## Regras

- **SEMPRE leia o arquivo seed** antes de qualquer teste de browser
- **SEMPRE delegue testes de browser** ao `gem-browser-tester`
- **SEMPRE capture evidências** para falhas (screenshot + console + network)
- **Não corrija issues nesta fase** — apenas documente
- **Não repita testes que falharam** — documente e avance
- **Para Phase 12**: se existir gap entre o que foi implementado e o que os testes E2E cobrem, adicione o teste E2E ausente e rode antes de reportar
- Se TODOS passarem, Phase 10 (verificação de fixes) pode ser pulada
