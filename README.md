# Docão Fazendão · Guerra do Chiqueiro 🐷🌽

Colheita Feliz encontra Clash of Clans no mundo do Docão. Cada conta tem uma fazenda: planta, coleta, constrói, treina porco e saqueia o chiqueiro dos outros (mesmo offline).

- **Jogar:** https://docao-fazendao.valentimm.workers.dev (domínio `fazenda.mvalentim.dev` depende do projeto na Vercel + CNAME, ver Deploy)
- **Conta:** a mesma do Docão Shooter (apelido + senha). Quem não tem cria na tela de entrada.

## Como funciona

| Parte | Onde |
| --- | --- |
| Cliente three.js (estático, câmera isométrica, modelos procedurais) | `index.html`, `style.css`, `src/` |
| Regras, economia (`settle`) e batalha determinística (`sim.js`) — o MESMO código no cliente e no Worker | `shared/` |
| API REST `docao-fazenda-api` (Cloudflare Worker + D1, **sem Durable Objects**) | `server/` |
| Tabelas `farm_*` no D1 `docao-contas` (o Shooter não é alterado) | `server/migrations/` |

- Login: o cliente entra no Worker do Shooter (`/api/auth/login` ou `/register`) e manda o token pra API da fazenda, que só **lê** `sessions`/`accounts`.
- Tudo é preguiçoso: cada rota faz `settle(estado, agora)` a partir dos timestamps salvos. Nada roda no servidor enquanto ninguém olha.
- Antitrapaça: o cliente só manda intenções (`plant`, `harvest`, `build`...). Preço, tempo e quantidade são do servidor. A batalha é resimulada do zero no Worker a partir dos comandos `[{t,u,x,y}]`; o resultado do cliente é ignorado (só comparamos o hash). `finish` vale uma vez, ataques expiram em 5 min, 300 ações/hora, 20 roubos/dia, 60 ataques/dia, lock otimista por `version`.

## Rodar local

```bash
npm test                                   # economia + simulação (node:test)
cd server && npx wrangler dev --local      # API em http://localhost:8787 (aplique as migrations do Shooter + a 0001_fazenda no D1 local)
python3 -m http.server 8080                # cliente: http://localhost:8080/?api=http://localhost:8787
node test/api-smoke.mjs <API> <TOKEN_A> [TOKEN_B]   # fumaça ponta a ponta (local ou produção)
```

## Deploy

- Worker: `cd server && npx wrangler deploy` (ou o dry-run + `make-deploy.mjs` com a API da Cloudflare).
- Migration: `server/migrations/0001_fazenda.sql` (só `CREATE TABLE IF NOT EXISTS farm_*`).
- Cliente (hoje): Worker `docao-fazendao` com o `dist/` embutido: `npm run build && node make-site-worker.mjs` e sobe o `/tmp/deploy-site.js` pela API da Cloudflare.
- Cliente (Vercel, quando o projeto existir): importar o repo na Vercel; o `vercel.json` já roda `npm run build` e publica `dist/`. Domínio `fazenda.mvalentim.dev` = CNAME `fazenda` → `cname.vercel-dns.com` no DNS do mvalentim.dev.
